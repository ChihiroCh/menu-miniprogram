FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y openssl ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
RUN npm ci
COPY apps/server apps/server
RUN npm run db:generate && npm run build -w apps/server
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
