// Централизованное чтение переменных окружения.
import 'node:process';

function req(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    return '';
  }
  return v;
}

function bool(name, def = false) {
  const v = process.env[name];
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function int(name, def) {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) ? v : def;
}

export const config = {
  env: req('NODE_ENV', 'development'),
  port: int('PORT', 3000),
  host: req('HOST', '0.0.0.0'),
  publicDir: req('PUBLIC_DIR', ''), // если пусто — вычисляется относительно src

  // Публичный URL Mini App (для кнопки бота и проверки origin)
  miniappUrl: req('MINIAPP_URL', 'https://example.com'),

  jwt: {
    secret: req('JWT_SECRET', 'dev-insecure-secret-change-me'),
    ttl: req('JWT_TTL', '30d'),
  },

  // Максимальный возраст Telegram initData (сек)
  initDataMaxAgeSec: int('INITDATA_MAX_AGE_SEC', 86400),
  // Разрешить fallback-логин без Telegram (только для локальной разработки)
  devLogin: bool('DEV_LOGIN', false),

  telegram: {
    botToken: req('BOT_TOKEN', ''),
    // long-polling (по умолчанию) или webhook
    useWebhook: bool('BOT_USE_WEBHOOK', false),
    webhookSecret: req('BOT_WEBHOOK_SECRET', ''),
  },

  // Стартовый allow-list: "123456:owner:Ева, 234567:maker:Кира, 345678:customer:Дмитрий"
  allowlist: req('ALLOWLIST', ''),

  // Суперадмины: список Telegram ID через запятую. Заходят всегда с полным
  // доступом и могут «смотреть от имени» любой роли/пользователя.
  superadminIds: req('SUPERADMIN_IDS', ''),

  database: {
    url: req('DATABASE_URL', ''),
  },
  redis: {
    url: req('REDIS_URL', 'redis://localhost:6379'),
  },

  // Claude через RouterAI (OpenAI-совместимый API)
  claude: {
    baseUrl: req('ROUTERAI_BASE_URL', 'https://routerai.ru/api/v1'),
    apiKey: req('ROUTERAI_API_KEY', ''),
    model: req('CLAUDE_MODEL', 'claude-sonnet-4'),
    visionModel: req('CLAUDE_VISION_MODEL', req('CLAUDE_MODEL', 'claude-sonnet-4')),
    maxTokens: int('CLAUDE_MAX_TOKENS', 1024),
    timeoutMs: int('CLAUDE_TIMEOUT_MS', 60000),
  },

  scraper: {
    driver: req('SCRAPER_DRIVER', 'apify'), // apify | mock
    apifyToken: req('APIFY_TOKEN', ''),
    apifyActor: req('APIFY_ACTOR', 'apify/instagram-scraper'),
    timeoutMs: int('SCRAPER_TIMEOUT_MS', 120000),
  },

  storage: {
    driver: req('STORAGE_DRIVER', 'disk'), // disk | s3
    diskDir: req('STORAGE_DIR', './data/media'),
    urlSecret: req('MEDIA_URL_SECRET', 'dev-media-secret-change-me'),
    urlTtlSec: int('MEDIA_URL_TTL_SEC', 3600),
    s3: {
      bucket: req('S3_BUCKET', ''),
      region: req('S3_REGION', 'ru-central1'),
      endpoint: req('S3_ENDPOINT', ''),
      accessKeyId: req('S3_ACCESS_KEY_ID', ''),
      secretAccessKey: req('S3_SECRET_ACCESS_KEY', ''),
    },
  },

  digest: {
    cron: req('DIGEST_CRON', '0 9 * * 1'), // понедельник 09:00
    // "https://…/rss|rss|Заголовок; https://…|html|Другой источник"
    sources: req('DIGEST_SOURCES', ''),
  },

  ffmpegPath: req('FFMPEG_PATH', ''),
};

export function parseAllowlist(raw = config.allowlist) {
  return String(raw)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, role = 'maker', ...nameParts] = entry.split(':').map((x) => x.trim());
      return {
        telegramId: id,
        role: role || 'maker',
        name: nameParts.join(':') || `User ${id}`,
      };
    })
    .filter((e) => e.telegramId && /^\d+$/.test(e.telegramId));
}

export function parseSuperadminIds(raw = config.superadminIds) {
  return String(raw)
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}

export function parseDigestSources(raw = config.digest.sources) {
  return String(raw)
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, type = 'rss', ...titleParts] = entry.split('|').map((x) => x.trim());
      return { url, type: type || 'rss', title: titleParts.join('|') || url };
    })
    .filter((e) => e.url);
}

export { bool as envBool, int as envInt };
