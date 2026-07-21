# Образ приложения: веб-сервер + воркер + бот (один образ, разные команды).
FROM node:22-bookworm-slim

# ffmpeg нужен для извлечения кадра из видео (раздел «Идея»).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

# Зависимости
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

# Исходники + схема Prisma
COPY server/ ./
RUN npx prisma generate

# Фронтенд отдаётся тем же сервером
COPY public /app/public

ENV NODE_ENV=production
ENV PUBLIC_DIR=/app/public

EXPOSE 3000

# По умолчанию — веб-сервер. Воркер запускается отдельной командой в compose.
CMD ["node", "src/index.js"]
