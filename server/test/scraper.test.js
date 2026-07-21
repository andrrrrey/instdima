// Тесты разбора ссылок Instagram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInstagramUrl } from '../src/services/scraper.js';

test('пост', () => {
  const r = parseInstagramUrl('https://www.instagram.com/p/Cy1nB8kLm2x/');
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'post');
  assert.equal(r.shortcode, 'Cy1nB8kLm2x');
});

test('reel', () => {
  const r = parseInstagramUrl('https://instagram.com/reel/Cx7hK2mAbCd/?igsh=x');
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'reel');
});

test('не-instagram ссылка отклоняется', () => {
  assert.equal(parseInstagramUrl('https://example.com/p/abc').ok, false);
  assert.equal(parseInstagramUrl('not a url').ok, false);
});

test('неподдерживаемый путь', () => {
  const r = parseInstagramUrl('https://www.instagram.com/username/');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unsupported_path');
});
