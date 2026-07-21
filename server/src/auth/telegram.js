// Валидация Telegram WebApp initData по алгоритму Telegram.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import crypto from 'node:crypto';

/**
 * Проверяет подпись initData и возвращает разобранные данные.
 * @returns {{ ok: boolean, reason?: string, user?: object, authDate?: number }}
 */
export function verifyInitData(initData, botToken, maxAgeSec = 86400) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, reason: 'empty' };
  }
  if (!botToken) {
    return { ok: false, reason: 'no_bot_token' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no_hash' };

  // data_check_string: все пары кроме hash, отсортированы по ключу, join '\n'
  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // constant-time сравнение
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_hash' };
  }

  const authDate = Number(params.get('auth_date') || 0);
  if (maxAgeSec > 0 && authDate > 0) {
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age > maxAgeSec) return { ok: false, reason: 'expired' };
  }

  let user = null;
  const userRaw = params.get('user');
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      return { ok: false, reason: 'bad_user' };
    }
  }
  if (!user || !user.id) return { ok: false, reason: 'no_user' };

  return { ok: true, user, authDate };
}
