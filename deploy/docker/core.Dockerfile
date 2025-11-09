FROM node:20-slim AS base

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

FROM base AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/core/tsconfig.json packages/core/tsconfig.json
COPY packages/core/src packages/core/src

RUN pnpm install --filter @rs485-homenet/core...
RUN pnpm --filter @rs485-homenet/core build

FROM base AS runner

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY scripts/run-core.mjs scripts/run-core.mjs
COPY --from=builder /app/packages/core/dist packages/core/dist

RUN pnpm install --filter @rs485-homenet/core... --prod

CMD ["node", "scripts/run-core.mjs"]
