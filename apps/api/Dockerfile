# syntax=docker/dockerfile:1
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace root files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests so npm understands the workspace layout
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Production-only install (tsx is in dependencies, so it lands in the runtime image)
RUN npm install --workspaces --include-workspace-root --omit=dev --no-audit --no-fund

# Copy source files at runtime — tsx loads .ts directly so no build step needed
COPY packages/shared/ ./packages/shared/
COPY apps/api/src/ ./apps/api/src/
COPY apps/api/tsconfig.json ./apps/api/

EXPOSE 8080

WORKDIR /app/apps/api
CMD ["npx", "tsx", "src/index.ts"]
