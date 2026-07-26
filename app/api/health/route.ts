import packageJson from "@/package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type LlmFeatureStatus = "configured" | "disabled" | "misconfigured";
type Environment = Readonly<Record<string, string | undefined>>;

export interface HealthPayload {
  status: "ok";
  version: string;
  commit: string | null;
  features: {
    llm: LlmFeatureStatus;
  };
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function resolveLlmFeatureStatus(
  env: Environment,
): LlmFeatureStatus {
  const hasKey = present(env.ANTHROPIC_API_KEY);
  const hasModel = present(env.ANTHROPIC_MODEL);

  if (!hasKey && !hasModel) return "disabled";
  if (hasKey && hasModel) return "configured";
  return "misconfigured";
}

export function resolveCommit(env: Environment): string | null {
  const value = (env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_SHA)?.trim();
  return value && /^[0-9a-f]{7,64}$/i.test(value) ? value.slice(0, 12) : null;
}

export function createHealthPayload(
  env: Environment = process.env,
): HealthPayload {
  return {
    status: "ok",
    version: packageJson.version,
    commit: resolveCommit(env),
    features: {
      llm: resolveLlmFeatureStatus(env),
    },
  };
}

export function GET(): Response {
  return Response.json(createHealthPayload(), {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}

export function HEAD(): Response {
  return new Response(null, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}
