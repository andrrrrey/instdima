// Тесты валидации Telegram initData (алгоритм HMAC Telegram).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyInitData } from '../src/auth/telegram.js';

const BOT_TOKEN = '123456:TEST-bot-token';

// Формирует корректно подписанную initData-строку.
function makeInitData(user, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAA');
  params.set('user', JSON.stringify(user));

  const pairs = [];
  for (const [k, v] of params.entries()) pairs.push(`${k}=${v}`);
  pairs.sort();
  const dcs = pairs.join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

test('валидная подпись принимается, user извлекается', () => {
  const initData = makeInitData({ id: 42, first_name: 'Тест' });
  const res = verifyInitData(initData, BOT_TOKEN);
  assert.equal(res.ok, true);
  assert.equal(res.user.id, 42);
});

test('подделанная подпись отклоняется', () => {
  let initData = makeInitData({ id: 42 });
  initData = initData.replace(/hash=[a-f0-9]+/, 'hash=' + '0'.repeat(64));
  const res = verifyInitData(initData, BOT_TOKEN);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'bad_hash');
});

test('чужой bot token не проходит', () => {
  const initData = makeInitData({ id: 42 });
  const res = verifyInitData(initData, 'other-token');
  assert.equal(res.ok, false);
});

test('устаревшая auth_date отклоняется', () => {
  const old = Math.floor(Date.now() / 1000) - 100000;
  const initData = makeInitData({ id: 42 }, old);
  const res = verifyInitData(initData, BOT_TOKEN, 3600);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'expired');
});

test('пустая строка отклоняется', () => {
  assert.equal(verifyInitData('', BOT_TOKEN).ok, false);
});
