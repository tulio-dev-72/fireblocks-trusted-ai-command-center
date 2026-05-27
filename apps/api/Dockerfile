# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages packages
COPY apps/api apps/api
COPY scripts scripts
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm turbo run build --filter=@taicc/api...

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable pnpm

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/scripts ./scripts

EXPOSE 10000
ENV API_HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-10000}/health/ready" || exit 1

CMD ["node", "-r", "./scripts/load-env.cjs", "apps/api/dist/index.js"]
