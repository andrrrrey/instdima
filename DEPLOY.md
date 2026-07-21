# Деплой на VPS (домен instdima.ru, IP 62.60.156.57)

Пошаговая установка на чистый сервер. SSL настраивается автоматически (Caddy +
Let's Encrypt) — вручную сертификаты получать не нужно.

`Caddyfile` в репозитории уже настроен на `instdima.ru` / `www.instdima.ru`.
Значит на сервере остаётся только заполнить `server/.env` и запустить.

## 0. Что нужно заранее

- Root-доступ к VPS по SSH.
- Доступ к DNS домена `instdima.ru` у регистратора.
- Токен Telegram-бота (@BotFather).
- Ключ RouterAI (для Claude). Apify — по желанию; без него скрейпер работает в
  режиме заглушки (`SCRAPER_DRIVER=mock`).
- Свой числовой Telegram ID (узнать: напишите @userinfobot) — для суперадмина.

## 1. DNS

В панели регистратора `instdima.ru` создайте A-записи на IP сервера:

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `@`   | `62.60.156.57` |
| A | `www` | `62.60.156.57` |

Сделайте это первым делом и дождитесь распространения (5–60 мин). Проверка:

```bash
dig +short instdima.ru     # → 62.60.156.57
```

> Пока DNS не указывает на сервер, Let's Encrypt не выдаст сертификат.

## 2. Docker на сервере

```bash
ssh root@62.60.156.57
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

## 3. Клонирование

```bash
cd /opt
git clone https://github.com/andrrrrey/instdima.git
cd instdima
git checkout claude/telegram-miniapp-instagram-dashboard-f5j9fz
```

## 4. Конфиг `server/.env`

Сгенерируйте два секрета:

```bash
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → MEDIA_URL_SECRET
```

Создайте и заполните конфиг:

```bash
cp server/.env.example server/.env
nano server/.env
```

Минимально нужно задать:

```ini
MINIAPP_URL=https://instdima.ru
DEV_LOGIN=false

BOT_TOKEN=ВАШ_ТОКЕН_БОТА
ALLOWLIST=ВАШ_TG_ID:owner:Ваше Имя
SUPERADMIN_IDS=ВАШ_TG_ID

# хосты = имена сервисов compose, НЕ менять:
DATABASE_URL=postgresql://contentplan:contentplan@postgres:5432/contentplan
REDIS_URL=redis://redis:6379

ROUTERAI_BASE_URL=https://routerai.ru/v1
ROUTERAI_API_KEY=ВАШ_КЛЮЧ_ROUTERAI
CLAUDE_MODEL=claude-sonnet-4      # уточните точное имя модели у RouterAI

SCRAPER_DRIVER=mock               # без Apify

STORAGE_DRIVER=disk
STORAGE_DIR=/data/media

JWT_SECRET=ПЕРВЫЙ_openssl_rand
MEDIA_URL_SECRET=ВТОРОЙ_openssl_rand

DIGEST_SOURCES=https://about.instagram.com/blog/rss|rss|Instagram Blog
DIGEST_CRON=0 9 * * 1
```

Полный список переменных с пояснениями — в `server/.env.example`.

## 5. Firewall

```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

Если у провайдера VPS есть облачный фаервол в панели — откройте там те же порты
22, 80, 443.

## 6. Запуск

```bash
cd /opt/instdima
docker compose up -d --build
```

`migrate` применит миграции и создаст пользователей из `ALLOWLIST`/`SUPERADMIN_IDS`;
поднимутся `app` (веб+бот), `worker`, `caddy` (выпустит SSL).

Проверка:

```bash
docker compose ps                       # все Up (migrate — Exited 0, это норма)
docker compose logs -f caddy            # дождитесь "certificate obtained"
curl -s https://instdima.ru/api/health  # → {"ok":true,...}
```

## 7. Привязка Mini App к боту

Приложение само выставляет кнопку меню бота на `MINIAPP_URL`. Дополнительно можно
через @BotFather: `/setmenubutton` → URL `https://instdima.ru`.

Тест: откройте бота в Telegram → `/start` → «Открыть контент-план».

## Обновление проекта

```bash
cd /opt/instdima
git pull
docker compose up -d --build
```

## Управление

```bash
docker compose logs -f app worker     # логи
docker compose restart app worker     # перезапуск после правки server/.env
docker compose down                   # остановить (данные в volumes сохраняются)
docker compose up -d                  # снова поднять
```

## Резервная копия (БД + медиа в docker volumes)

```bash
docker run --rm -v instdima_pgdata:/v -v $(pwd):/b alpine tar czf /b/pgdata-backup.tgz -C /v .
docker run --rm -v instdima_media:/v  -v $(pwd):/b alpine tar czf /b/media-backup.tgz  -C /v .
```

## Если что-то не так

- **Caddy не выдал сертификат** — DNS ещё не указывает на сервер или закрыты
  80/443. Проверьте `dig +short instdima.ru` и `ufw status`, затем
  `docker compose restart caddy`.
- **`/api/health` не отвечает** — `docker compose ps` и `docker compose logs app`.
- **Ошибка ИИ в разделах «Идея»/«Дайджест»** — проверьте `ROUTERAI_API_KEY`,
  `ROUTERAI_BASE_URL`, `CLAUDE_MODEL`; после правки `.env` → `docker compose up -d`.
- **Бот не открывает приложение** — в `.env` заданы `BOT_TOKEN` и
  `MINIAPP_URL=https://instdima.ru`; в `docker compose logs app` есть
  `[bot] long-polling запущен`.
