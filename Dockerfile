FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY contract/package.json contract/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

FROM deps AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip xz-utils \
  && rm -rf /var/lib/apt/lists/* \
  && curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh \
  && /root/.local/bin/compact update 0.31.1
COPY . .
RUN pnpm contract:compile && pnpm build

FROM node:22-bookworm-slim AS production
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/.covenant-runtime /app/logs/tests \
  && chown -R nextjs:nodejs /app/.covenant-runtime /app/logs
COPY --from=builder --chown=nextjs:nodejs /workspace/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/contract/src/managed/covenant-watch ./contract/src/managed/covenant-watch
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://'+process.env.HOSTNAME+':3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
