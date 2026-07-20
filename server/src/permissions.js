// Серверный аналог правил видимости из «описание UI.txt».
// Фронтенду не доверяем: фильтрация набора публикаций и урезание полей —
// на бэкенде, в зависимости от роли и выданных прав.

// Статусы, которые видит Дмитрий (заказчик).
export const CUSTOMER_STATUSES = ['work', 'review', 'ready', 'published'];

export function isOwner(u) {
  return u.role === 'owner';
}
export function isMaker(u) {
  return u.role === 'maker';
}
export function isCustomer(u) {
  return u.role === 'customer';
}
export function isFashion(u) {
  return u.role === 'fashion';
}

function rights(u) {
  const r = u.rights || {};
  return {
    createPub: !!r.createPub,
    seeAll: !!r.seeAll,
    createTask: !!r.createTask,
  };
}

// Может ли создавать публикации: Ева всегда, контент-мейкер — при праве createPub.
export function canCreatePub(u) {
  return isOwner(u) || (isMaker(u) && rights(u).createPub);
}

// Может ли видеть общий контент-план (вкладка «Все»).
export function canSeeAll(u) {
  return isOwner(u) || (isMaker(u) && rights(u).seeAll);
}

// Управление пользователями/настройками — только владелец.
export function canManageUsers(u) {
  return isOwner(u);
}

// Согласование/возврат на правки — только владелец.
export function canApprove(u) {
  return isOwner(u);
}

// Вкладки раздела «План» под роль.
export function planTabsFor(u) {
  if (isOwner(u)) return ['control', 'all', 'calendar'];
  if (isMaker(u)) return canSeeAll(u) ? ['tasks', 'all', 'calendar'] : ['tasks', 'calendar'];
  if (isCustomer(u)) return ['calendar', 'list'];
  return [];
}

// Разрешённые пользователю переходы статусов по конкретной публикации.
export function allowedStatusTransitions(u, pub) {
  if (isOwner(u)) {
    // владелец может выставить любой статус
    return ['draft', 'work', 'review', 'fixes', 'ready', 'published', 'canceled'];
  }
  if (isMaker(u)) {
    const own = pub.ownerId && pub.ownerId === u.id;
    if (!own) return [];
    // цепочка контент-мейкера по своим задачам
    const map = {
      draft: ['work'], // начать работу
      work: ['review'], // отправить на согласование
      fixes: ['review'], // внести правки → снова на согласование
      ready: ['published'], // отметить опубликованной
    };
    return map[pub.status] || [];
  }
  return [];
}

// SQL/where-фильтр набора публикаций под роль (для Prisma findMany).
export function pubVisibilityWhere(u) {
  const base = { archived: false };
  if (isCustomer(u)) {
    return { ...base, status: { in: CUSTOMER_STATUSES } };
  }
  // владелец и контент-мейкер видят все неархивные;
  // разбивку «мои задачи / все» делает клиент по данным + серверные фильтры.
  return base;
}

// Может ли пользователь вообще открыть данную публикацию.
export function canViewPub(u, pub) {
  if (pub.archived && !isOwner(u)) return false;
  if (isCustomer(u)) return CUSTOMER_STATUSES.includes(pub.status);
  return true;
}

// Может ли редактировать поля публикации (не считая переходов статуса).
export function canEditPub(u, pub) {
  if (isOwner(u)) return true;
  if (isMaker(u)) {
    // свои задачи; создавать/трогать чужое нельзя
    return pub.ownerId === u.id || (!pub.ownerId && rights(u).createPub);
  }
  return false;
}

export { rights as userRights };
