# Production deployment and operations

Kafka Engineering Hub is a mostly static, local-first Next.js application.
There is no database, account system, CMS, or live Kafka connection. The only
optional paid/public egress is `POST /api/diagnose/llm`, which calls Anthropic
when explicitly configured.

## Deployment requirements

- Node.js 22 or newer
- pnpm 11.17.0
- A public HTTPS origin in `NEXT_PUBLIC_SITE_URL`
- TLS termination in front of every production origin and subdomain
- No Anthropic configuration unless the optional LLM action is wanted

Validate the environment that will perform the production build:

```bash
NEXT_PUBLIC_SITE_URL=https://example.com pnpm check:production-env
```

The checker reads the current process environment; it does not load an env file
itself. For an explicit local-only check, HTTP is accepted only for localhost:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000 pnpm check:production-env --local
```

## Environment variables

### Build-time public values

Next.js inlines `NEXT_PUBLIC_*` values during `pnpm build`. Changing them on a
running container does not update the generated metadata or browser bundle.

| Variable | Requirement |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Required for production. Must be an HTTPS origin with no credentials, path, query, or fragment. A root trailing slash is accepted. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Optional Plausible site domain. Analytics remains off when unset. |

### Runtime server values

| Variable | Requirement |
| --- | --- |
| `ANTHROPIC_API_KEY` | Optional. Enables the external LLM boundary only when `ANTHROPIC_MODEL` is also set. |
| `ANTHROPIC_MODEL` | Required whenever `ANTHROPIC_API_KEY` is set. There is no moving/default model fallback. |
| `TRUST_PROXY_HEADERS` | Optional. Set to `true` only behind a trusted proxy that removes client-supplied forwarding headers and writes authoritative ones. Vercel is trusted automatically when it sets `VERCEL=1`. |
| `GIT_SHA` | Optional hexadecimal commit SHA shown in shortened form by `/api/health`. Vercel supplies `VERCEL_GIT_COMMIT_SHA` automatically. |
| `HOSTNAME` / `PORT` | Standalone listener settings. The image defaults to `0.0.0.0:3000`. |
| `NEXT_TELEMETRY_DISABLED` | The provided image sets this to `1`. |

Never pass Anthropic credentials as Docker build arguments or `NEXT_PUBLIC_*`
values.

## Vercel

1. Import the repository and use Node.js 22.
2. Keep the install/build commands as `pnpm install --frozen-lockfile` and
   `pnpm build`.
3. Set `NEXT_PUBLIC_SITE_URL` for each production build. Set
   `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` only if Plausible is desired.
4. Optionally set both `ANTHROPIC_API_KEY` and an explicit
   `ANTHROPIC_MODEL`. Do not set only one.
5. Do not set `TRUST_PROXY_HEADERS` merely because forwarding headers exist;
   Vercel is recognized through its platform-managed `VERCEL=1` value.
6. Configure an uptime check against `GET /api/health`.

Preview deployments should use a canonical-origin policy appropriate for the
project. Do not promote a build whose `NEXT_PUBLIC_SITE_URL` points at another
environment.

## Docker

The root `Dockerfile` uses Node 22 Alpine, Corepack with exact pnpm 11.17.0,
the frozen workspace lockfile, Next.js standalone output, a non-root runtime,
and a built-in health check.

```bash
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://example.com \
  --build-arg NEXT_PUBLIC_PLAUSIBLE_DOMAIN=example.com \
  -t kafka-hub:release .

docker run --rm -p 3000:3000 \
  --env-file .env.production \
  -e GIT_SHA="$(git rev-parse HEAD)" \
  kafka-hub:release
```

The Plausible build argument is optional. Keep `.env.production` outside Git,
restrict its filesystem permissions, and omit Anthropic variables entirely
when the LLM action is disabled.

When a reverse proxy fronts the container, terminate TLS there and forward to
port 3000. Set `TRUST_PROXY_HEADERS=true` only if that proxy overwrites
`X-Forwarded-For` and `X-Real-IP`; appending to or preserving untrusted client
values permits rate-limit spoofing.

## Direct standalone deployment

`pnpm build` creates `.next/standalone/server.js`. The `pnpm start` command
copies public/static assets beside it and starts that exact minimal server:

```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_SITE_URL=https://example.com pnpm check:production-env
NEXT_PUBLIC_SITE_URL=https://example.com pnpm build
HOSTNAME=0.0.0.0 PORT=3000 NODE_ENV=production pnpm start
```

## Health checks

`GET /api/health` and `HEAD /api/health` use the Node runtime, are forced
dynamic, and return `Cache-Control: no-store`. A successful core application
always returns HTTP 200.

The GET payload contains:

- `status: "ok"`
- the package version
- a validated, shortened commit identifier or `null`
- optional LLM status:
  - `disabled`: neither LLM variable is present
  - `configured`: key and model are both present
  - `misconfigured`: only one is present

No key or model value is returned. LLM misconfiguration does not make the
static/core site unhealthy.

## Security headers and embeds

Production responses disable the framework identification header and include:

- a static-compatible Content Security Policy
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a restrictive `Permissions-Policy`
- DNS-prefetch and cross-domain-policy restrictions
- one-year HSTS with `includeSubDomains` and no `preload`

The CSP permits same-origin application resources and APIs, Next.js inline
bootstrap code, inline styles, data/blob images, local/data fonts, blob
workers, same-origin iframes, and optional `https://plausible.io` script and
connect traffic. `unsafe-eval` is present only in development.

All routes except `/simulate/embed/*` use `frame-ancestors 'none'` and
`X-Frame-Options: DENY`. Simulator embed routes intentionally use
`frame-ancestors *` and do not send `X-Frame-Options`. Do not add a global
clickjacking header at a proxy/CDN unless it preserves this exception.

Cross-origin isolation headers are intentionally absent because they can break
the public embed contract.

## Optional LLM boundary

The static Diagnose engine remains local. Only an explicit click on the LLM
action sends data to Anthropic.

- The browser and server apply best-effort common-secret redaction. This is not
  a guarantee; users must review input before submission.
- The request must use `Content-Type: application/json`.
- The complete request body is limited to 20 KiB while streaming, including
  chunked requests.
- The `config` string is limited to 16,000 characters.
- The Anthropic client has a 15-second per-attempt timeout and at most one
  retry. The route has a 25-second overall abort budget, Vercel
  `maxDuration = 30`, and the browser aborts after 28 seconds.
- Provider output must be plain JSON or one fenced JSON block and is normalized
  to at most five bounded findings.
- Prompt/cache schema version, selected model, and redacted config all
  contribute to the cache key.
- Every response is `no-store` and includes `X-Request-Id`.

Provider and output failures log only a structured event name, request ID, and
safe category. Raw provider errors and pasted configuration are never logged by
this route.

## Rate limiting and cache scope

The LLM endpoint uses an in-process token bucket with a burst/refill rate of
10 requests per minute. Trusted, validated proxy addresses receive separate
buckets. Without trusted proxy data, requests deliberately share one global
fallback bucket.

Limiter state is LRU-bounded to 1,024 buckets. The response cache is bounded to
256 entries. Both are per-process and disappear on restart; serverless regions,
instances, and replicas do not share them.

For public/multi-instance deployment, use optional platform controls such as a
WAF/rate rule and Anthropic spend caps. A paid shared rate-limit service is not
required by this application.

## Rollback

### Vercel

1. Promote the last known-good deployment.
2. Confirm `/api/health`, `/`, `/diagnose`, and an embed route.
3. If the issue is LLM-only, remove `ANTHROPIC_API_KEY` to disable that boundary
   while keeping the core site available.

### Docker

1. Stop the affected container.
2. Start the previous immutable image tag with the same runtime environment.
3. Verify health and headers before restoring traffic.

There are no schema migrations or data restores.

## Smoke checklist

- `pnpm check:production-env` passes in the build environment.
- `pnpm audit --prod --audit-level high` is clean.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, and
  `pnpm build` pass.
- `/api/health` returns 200 and `Cache-Control: no-store`.
- `/` and `/diagnose` send frame denial headers.
- `/simulate/embed/<scenario>` sends `frame-ancestors *` and no
  `X-Frame-Options`.
- The Diagnose, Simulate, Workbench, Protocol Lab, Learn, Notes, and Runbook
  surfaces load without CSP console errors.
- The optional LLM action is either intentionally disabled or tested with an
  approved non-sensitive fixture.

## Backup and incident response

All durable content, configuration, and application state is in Git. There is
no database or user-upload store to back up. Protect the Git repository, release
artifacts, deployment configuration, and secret-manager history.

For an incident:

1. Confirm core health and scope the affected deployment/commit.
2. Disable the optional LLM boundary by removing its key if egress, spend, or
   provider behavior is involved.
3. Correlate safe server logs with `X-Request-Id`; do not request raw user
   configuration for routine triage.
4. Review WAF/platform logs and provider spend controls where enabled.
5. Rotate any credential that may have been exposed.
6. Roll back to the last known-good deployment.
7. Handle vulnerability reports through the private process in
   [`SECURITY.md`](../SECURITY.md).
