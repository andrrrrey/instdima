// Сериализаторы: превращают строки БД в объекты той формы, что рендерит
// фронтенд (public/index.html), и урезают поля под роль.
import { nowStamp } from './util/format.js';
import { mediaUrl } from './services/storage.js';
import { isCustomer, isOwner, isMaker, allowedStatusTransitions } from './permissions.js';

// «Ключ человека» для фронтенда = user.id. Клиент подмешивает карту people
// (id → {n,i,c}) из /api/bootstrap, поэтому все существующие lookup'ы работают.
export function personKey(user) {
  return user ? user.id : '';
}

export function serializeUserPublic(u) {
  return {
    id: u.id,
    telegramId: String(u.telegramId),
    name: u.name,
    initials: u.initials,
    color: u.color,
    role: u.role,
    rights: u.rights || {},
    active: u.active,
    superadmin: !!u.superadmin,
  };
}

// Карта people для фронтенда: { [id]: { n, i, c } }
export function peopleMap(users) {
  const map = {};
  for (const u of users) map[u.id] = { n: u.name, i: u.initials, c: u.color };
  return map;
}

function serializeMedia(media) {
  if (!media) return null;
  const url = mediaUrl(media.id);
  const out = { kind: media.kind, url, id: media.id };
  // Постер-кадр для видео (надёжное превью на iOS).
  if (media.framePath) out.poster = `${url}&frame=1`;
  return out;
}

function stamp(date) {
  return nowStamp(new Date(date));
}

// Публикация под конкретного пользователя (роль решает состав полей).
export function serializePublication(pub, viewer) {
  const base = {
    id: pub.id,
    title: pub.title,
    type: pub.type,
    date: pub.date,
    time: pub.time,
    status: pub.status,
    g: pub.g,
    dur: pub.dur,
    text: pub.text,
    media: serializeMedia(pub.media),
  };

  // Дмитрий (заказчик): без ответственного, дедлайна, просрочки,
  // комментариев, истории, внутренних рабочих деталей.
  if (isCustomer(viewer)) {
    return base;
  }

  const full = {
    ...base,
    owner: pub.ownerId || '',
    deadline: pub.deadline || '',
    alt: pub.alt,
    tags: pub.tags || [],
    track: pub.track,
    trackAt: pub.trackAt,
    late: pub.late,
    updated: stamp(pub.updatedAt),
    comments: (pub.comments || []).map((c) => ({
      w: c.authorId || '',
      t: c.text,
      d: stamp(c.createdAt),
    })),
    // История изменений — только владельцу.
    history: isOwner(viewer)
      ? (pub.history || []).map((h) => ({ d: stamp(h.createdAt), t: h.text }))
      : [],
    // Подсказка клиенту, какие действия доступны (кнопки на карточке).
    _can: {
      edit: isOwner(viewer) || (isMaker(viewer) && pub.ownerId === viewer.id),
      transitions: allowedStatusTransitions(viewer, pub),
      approve: isOwner(viewer),
    },
  };
  return full;
}

export function serializeIdea(idea, viewer) {
  const out = {
    id: idea.id,
    type: idea.type,
    g: idea.g,
    dur: idea.dur,
    state: idea.state,
    status: idea.status, // processing | ready | error
    tags: idea.tags || [],
    title: idea.title,
    note: idea.note,
    ai: idea.ai,
    text: idea.text,
    hashtags: idea.hashtags || [],
    author: idea.author,
    url: idea.url,
    date: stamp(idea.createdAt),
    media: serializeMedia(idea.media),
  };
  if (idea.status === 'error') out.error = idea.error || 'Не удалось разобрать ссылку';
  return out;
}

export function serializeDigestItem(item, readSet, viewer) {
  const o = {
    id: item.id,
    cat: item.cat,
    t: item.t,
    ch: item.ch,
    me: item.me,
    src: item.src,
    d: item.d,
    read: readSet ? readSet.has(item.id) : false,
  };
  // «Что учитывать в контенте» Дмитрию не показываем.
  if (!isCustomer(viewer)) o.co = item.co;
  return o;
}

export function serializeDigest(digest, readSet, viewer) {
  return {
    id: digest.id,
    range: digest.rangeLabel,
    summary: digest.summary,
    publishedAt: digest.publishedAt,
    items: (digest.items || []).map((it) => serializeDigestItem(it, readSet, viewer)),
  };
}
