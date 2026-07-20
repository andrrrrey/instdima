# Контент-план — Telegram Mini App (Этап 1)

Telegram Mini App для команды: планирование Instagram-контента, разбор публичных
публикаций по ссылке и еженедельный дайджест обновлений Instagram. Доступ — только для
указанных пользователей, с разграничением по ролям.

> Instagram и Facebook — продукты компании Meta Platforms Inc., признанной экстремистской
> организацией и запрещённой на территории РФ.

## Возможности

- **План** — контент-календарь: создание/редактирование/перенос/удаление публикаций,
  загрузка медиа (фото для поста, видео для Reels), рабочие статусы, дедлайны, комментарии,
  история изменений. Состав вкладок, полей и кнопок зависит от роли.
- **Идеи** — разбор публичной ссылки Instagram: скрейпер извлекает медиа, текст и хештеги,
  ffmpeg берёт кадр из видео, Claude описывает сцену. Файл сохраняется и доступен для скачивания.
- **Дайджест** — еженедельная выжимка обновлений Instagram: сбор источников, перевод и
  структурирование через Claude («что изменилось / что значит / что учитывать»).

## Роли

| Роль | Кто | Доступ |
|---|---|---|
| `owner` | Ева (владелец) | Полный доступ, согласование, управление командой и правами |
| `maker` | Контент-мейкер | Свои задачи; права выдаёт владелец (создавать публикации, видеть общий план, создавать задачи) |
| `customer` | Заказчик | Только просмотр: календарь/список, без внутренних статусов, дедлайнов и комментариев |
| `fashion` | Fashion-ресёрчер | Только раздел «Идеи» (на будущее) |

Правила видимости и прав реализованы на бэкенде (`server/src/permissions.js`) — фронтенду не
доверяем.

## Технологии

Telegram Mini App (frontend) · Node.js + Fastify · PostgreSQL (Prisma) · Redis + BullMQ ·
Claude через RouterAI (OpenAI-совместимый API) · Apify (скрейпер) · ffmpeg · хранилище
диск/S3 · Caddy (HTTPS, Let's Encrypt).

```
public/index.html      — фронтенд (дизайн без изменений, подключён к API)
server/                — бэкенд (веб-сервер, воркер, бот)
docker-compose.yml     — postgres, redis, app, worker, caddy
```

## Что оформляет Заказчик (внешние доступы, п. 4 ТЗ)

Оплачивает и оформляет на себя:
1. **Бот в Telegram** — создать у @BotFather, получить `BOT_TOKEN`.
2. **Ключ Claude через RouterAI** — `ROUTERAI_API_KEY` и базовый URL.
3. **Аккаунт скрейпера (Apify)** — `APIFY_TOKEN`.
4. **VPS + домен + HTTPS** — сервер (реком. 2 vCPU / 4 ГБ / 60–80 ГБ SSD) и домен;
   TLS-сертификат бесплатный (Let's Encrypt через Caddy).

## Развёртывание (production, Docker)

1. Клонировать репозиторий на VPS, направить DNS-домена на сервер.
2. Заполнить конфиг:
   ```bash
   cp server/.env.example server/.env
   # отредактировать server/.env: BOT_TOKEN, MINIAPP_URL, ALLOWLIST,
   # ROUTERAI_*, APIFY_TOKEN, JWT_SECRET, MEDIA_URL_SECRET, DIGEST_SOURCES
   ```
   В `MINIAPP_URL` укажите ваш HTTPS-домен, в `ALLOWLIST` — Telegram ID пользователей и роли.
3. Прописать домен в `Caddyfile` (заменить `your-domain.example.com`).
4. Запустить:
   ```bash
   docker compose up -d --build
   ```
   Сервис `migrate` применит миграции и создаст пользователей из `ALLOWLIST`.
5. В @BotFather задать URL Mini App у бота (Bot Settings → Menu Button / или через
   `/setmenubutton`). Приложение само выставляет меню-кнопку при старте.

Проверка: откройте бота в Telegram, нажмите `/start` → «Открыть контент-план».

### Как узнать Telegram ID

Пользователь пишет любому боту вроде @userinfobot, тот присылает числовой `id`. Этот id и роль
вносятся в `ALLOWLIST` (или владелец добавляет участника прямо в приложении: «Ещё → Команда»).

## Локальная разработка

Нужны запущенные PostgreSQL и Redis.

```bash
cd server
npm install
cp .env.example .env
# указать DATABASE_URL, REDIS_URL; для входа без Telegram:
#   DEV_LOGIN=true, SCRAPER_DRIVER=mock, ALLOWLIST=1001:owner:Ева
npx prisma migrate dev
node prisma/seed.js

# два процесса:
node --env-file=.env src/index.js     # веб + бот
node --env-file=.env src/worker.js    # воркер (идеи, дайджест)
```

При `DEV_LOGIN=true` можно открыть `http://localhost:3000/?tg=1001` в браузере и войти под
пользователем с этим Telegram ID (для проверки ролей: `?tg=1002`, `?tg=1003` и т.д.).

## Тесты

```bash
cd server
npm test    # правила ролей, валидация Telegram initData, разбор ссылок
```

## Архитектура API

Все запросы (кроме входа и отдачи медиа по подписанной ссылке) требуют `Bearer`-токен,
выдаваемый после проверки Telegram `initData`.

- `POST /api/auth/telegram` — вход, возвращает JWT.
- `GET /api/bootstrap` — профиль, права, команда (people), возможности.
- `GET/POST/PATCH/DELETE /api/publications*` — раздел «План» (+ `/status`, `/comments`,
  `/duplicate`, `/archive`, `/media`).
- `GET/POST/PATCH/DELETE /api/ideas*` — раздел «Идея» (+ `/analyze`, `/to-plan`, `/download`).
- `GET/POST /api/digest*` — дайджест (+ `/generate`, `/sources` — для владельца).
- `GET/POST/PATCH/DELETE /api/users*` — управление командой (для владельца).
- `GET /api/media/:id?token=…` — отдача медиа по короткоживущей подписанной ссылке.

## Границы Этапа 1 (п. 6 ТЗ)

Не входит: автопостинг в Instagram; углублённый разбор (речь из видео, несколько кадров,
рекомендации под контент-план — Этап 2); доступ к приватным аккаунтам; оформление и оплата
внешних сервисов.
