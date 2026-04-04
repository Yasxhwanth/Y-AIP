# Y-AIP MCP Gateway — Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# Install deps separately for better caching
FROM base AS deps
COPY package.json ./
RUN npm install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
