# Official multi-platform manifest digest verified 2026-09-07; runtime build remains a separate gate.
ARG NODE_IMAGE=node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN test "$(node --version)" = v24.20.0 && npm install --global npm@11.19.0
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci
COPY frontend ./frontend
COPY shared ./shared
COPY data/destinations-legacy-public.json ./data/destinations-legacy-public.json
COPY scripts/compress-build.mjs ./scripts/compress-build.mjs
RUN npm run build

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
RUN test "$(node --version)" = v24.20.0 && npm install --global npm@11.19.0
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=5000 PROVIDER_STATE_FILE=/app/var/provider-state.json
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./package.json
COPY backend ./backend
COPY shared ./shared
COPY --from=build /app/frontend/dist ./frontend/dist
COPY data ./data
COPY scripts/reset-provider.mjs ./scripts/reset-provider.mjs
RUN mkdir -p /app/var && chown node:node /app/var
USER node
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:5000/health',{signal:AbortSignal.timeout(2500)}).then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "backend/server.js"]
