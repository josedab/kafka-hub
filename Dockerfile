# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable \
  && corepack prepare pnpm@11.17.0 --activate

WORKDIR /app

FROM base AS dependencies

COPY . .
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder

ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN

RUN pnpm check:production-env
RUN pnpm --recursive --filter "./packages/*" --if-present build
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health',{cache:'no-store',signal:AbortSignal.timeout(4000)}).then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
