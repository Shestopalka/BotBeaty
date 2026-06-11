# ─────────────────────────────────────────────────────────────────────────────
# BeatyBOT — єдиний сервіс: API (NestJS) + Mini App (React), які роздаються з API.
# Збираємо монорепо й зберігаємо структуру apps/api + apps/mini-app, бо main.ts
# шукає Mini App за відносним шляхом ../../mini-app/dist від apps/api/dist.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# 1) Спершу маніфести — для кешу npm install
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mini-app/package.json apps/mini-app/package.json
RUN npm ci

# 2) Вихідний код і збірка обох застосунків
COPY . .
RUN npm run build -w @beatybot/mini-app \
 && npm run build -w @beatybot/api

# ─── Production image ────────────────────────────────────────────────────────
FROM node:20-slim AS production
ENV NODE_ENV=production
WORKDIR /app

# Тільки production-залежності
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mini-app/package.json apps/mini-app/package.json
RUN npm ci --omit=dev && npm cache clean --force

# Білди зі стадії builder (структуру зберігаємо)
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/mini-app/dist ./apps/mini-app/dist

# cwd = apps/api: так працює і glob міграцій (dist/database/migrations/*.js),
# і роздача Mini App (../../mini-app/dist)
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
