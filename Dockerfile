# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# El monorepo usa workspaces: se copia todo y se compilan paquetes, servidor y web.
COPY . .
RUN npm ci --ignore-scripts \
    && npm run build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8181 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 8181
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8181)+'/manifest.json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
