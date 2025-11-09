FROM node:20 AS build
WORKDIR /app

# Copy backend manifests and prisma first for better caching
COPY backend/package*.json backend/tsconfig.json backend/prisma ./backend/
WORKDIR /app/backend
RUN npm ci && npx prisma generate

# Build TypeScript
COPY backend/src ./src
RUN npm run build

# --- Runtime image ---
FROM node:20-slim
WORKDIR /app/backend
ENV NODE_ENV=production

# Install system deps required by Prisma engines (OpenSSL) and certs
RUN apt-get update -y \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Install only production deps
COPY --from=build /app/backend/package*.json ./
RUN npm ci --omit=dev

# Copy compiled app and prisma schema
COPY --from=build /app/backend/dist ./dist
COPY backend/prisma ./prisma

EXPOSE 4000

# Apply migrations then start the server
CMD ["sh","-c","npx prisma migrate deploy && node dist/index.js"]
