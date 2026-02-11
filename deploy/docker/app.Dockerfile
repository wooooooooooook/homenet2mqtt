# Stage 1: Builder
FROM node:22-alpine AS builder

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable

# Install build tools for native modules (if any)
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages packages
COPY scripts scripts

RUN pnpm install --recursive --no-frozen-lockfile
RUN pnpm build

# Remove development dependencies to reduce size of node_modules
# We must do this BEFORE removing workspace packages that are in 'dependencies'
RUN pnpm install --prod --no-frozen-lockfile

# Now remove source code and unneeded packages
RUN rm -rf packages/ui \
  packages/*/src \
  packages/*/test \
  packages/*/tsconfig*.json \
  packages/*/*.md \
  scripts

# Stage 2: Runner
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime dependencies
# bash: for run.sh
# tini: lightweight init for PID 1
# socat: for serial port bridging in dev/test environments
# tzdata: for timezone support
RUN apk add --no-cache bash tini socat tzdata

# Copy application from builder
COPY --from=builder /app /app

ENV NODE_ENV=production

# Setup run script
COPY deploy/docker/run.sh /run.sh
RUN chmod +x /run.sh

ENTRYPOINT [ "/sbin/tini", "--", "/run.sh" ]
