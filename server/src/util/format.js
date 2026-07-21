// Форматирование дат/аватаров в том же стиле, что и фронтенд (public/index.html).

const MONG = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const pad = (n) => String(n).padStart(2, '0');

// "20 июля, 14:30" — как nowStamp() во фронтенде
export function nowStamp(d = new Date()) {
  return `${d.getDate()} ${MONG[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "20 июля" — как fmtD() во фронтенде
export function fmtD(dk) {
  const [y, m, d] = String(dk).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return `${date.getDate()} ${MONG[date.getMonth()]}`;
}

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysKey(dk, n) {
  const [y, m, d] = String(dk).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + n);
  return dateKey(date);
}

// Инициалы и стабильный цвет по имени — для новых пользователей из allow-list.
const AVATAR_COLORS = ['#8E9199', '#7C8AA0', '#9A8C7C', '#87908A', '#A08C96', '#8C99A0', '#9E9488'];

export function initialsFrom(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function colorFor(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export { MONG };
