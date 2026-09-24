# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
# `prepare` runs husky, a devDependency that --omit=dev does not install, so it
# fails with 127. Drop only that script here; --ignore-scripts would also skip
# bcrypt's install step and ship an image without its native binary.
RUN npm pkg delete scripts.prepare && npm ci --omit=dev
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
