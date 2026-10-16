# syntax=docker/dockerfile:1
FROM node:24.22.0-bookworm-slim AS toolchain
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.11.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM toolchain AS dependencies
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM dependencies AS build
COPY . .
RUN npm run build

FROM toolchain AS production-dependencies
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --prod --frozen-lockfile --store-dir /pnpm/store

FROM node:24.22.0-bookworm-slim AS editorial
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data HOST=0.0.0.0 PORT=3000
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY migrations ./migrations
COPY app/lib/database.server.ts app/lib/storage.server.ts ./app/lib/
COPY scripts/migrate.ts scripts/backup.ts scripts/init-public.mjs scripts/container-entrypoint.sh ./scripts/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "scripts/container-entrypoint.sh"]

FROM caddy:2.11.7-alpine AS public
ENV PORT=8080 PUBLIC_ROOT=/data/public/current
COPY config/Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
