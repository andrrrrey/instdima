// Каталог типов уведомлений и дефолты — общие для API и сервиса отправки.
// Ключи стабильны (не зависят от языка UI); фронтенд подставляет подписи.
export const NOTIFY_DEFAULTS = {
  deadline: true, // Напоминание о дедлайне
  digest: true, // Дайджест новостей
  approval: true, // Согласование (решение владельца / отправка на согласование)
  comments: true, // Комментарии в карточках
  published: false, // Публикация вышла (для заказчика)
};

export const NOTIFY_KEYS = Object.keys(NOTIFY_DEFAULTS);

// Полный набор значений пользователя: дефолты, перекрытые сохранёнными.
export function resolvePrefs(user) {
  const stored = (user && user.notifyPrefs) || {};
  const out = { ...NOTIFY_DEFAULTS };
  for (const k of NOTIFY_KEYS) if (k in stored) out[k] = !!stored[k];
  return out;
}

// Включён ли конкретный тип уведомления у пользователя (с учётом дефолта).
export function prefEnabled(user, key) {
  const stored = (user && user.notifyPrefs) || {};
  if (key in stored) return !!stored[key];
  return key in NOTIFY_DEFAULTS ? NOTIFY_DEFAULTS[key] : true;
}

// Оставляет из входных данных только известные ключи, приведённые к boolean.
export function sanitizePrefs(input) {
  const out = {};
  if (input && typeof input === 'object') {
    for (const k of NOTIFY_KEYS) if (k in input) out[k] = !!input[k];
  }
  return out;
}
