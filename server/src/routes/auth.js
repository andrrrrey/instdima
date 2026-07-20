// Маршруты авторизации: вход через Telegram initData + bootstrap-данные.
import { config, parseSuperadminIds } from '../config.js';
import { prisma } from '../db.js';
import { verifyInitData } from '../auth/telegram.js';
import { signSession, authGuard } from '../auth/session.js';
import { initialsFrom, colorFor } from '../util/format.js';
import { serializeUserPublic, peopleMap } from '../serializers.js';
import { planTabsFor, canCreatePub, canSeeAll, canManageUsers } from '../permissions.js';

async function loadTeam() {
  return prisma.user.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
}

function capabilities(user) {
  return {
    role: user.role,
    rights: user.rights || {},
    planTabs: planTabsFor(user),
    canCreatePub: canCreatePub(user),
    canSeeAll: canSeeAll(user),
    canManageUsers: canManageUsers(user),
  };
}

// Суперадмин из SUPERADMIN_IDS входит всегда (даже если не в allow-list):
// авто-создаём/обновляем как владельца с флагом superadmin.
async function ensureSuperadmin(tgId, tgName) {
  const ids = parseSuperadminIds();
  if (!ids.includes(String(tgId))) return null;
  const telegramId = BigInt(tgId);
  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) {
    if (!existing.superadmin || !existing.active) {
      return prisma.user.update({ where: { telegramId }, data: { superadmin: true, active: true } });
    }
    return existing;
  }
  const name = tgName || `Суперадмин ${tgId}`;
  return prisma.user.create({
    data: {
      telegramId,
      name,
      initials: initialsFrom(name),
      color: colorFor(name),
      role: 'owner',
      rights: { createPub: true, seeAll: true, createTask: true },
      active: true,
      superadmin: true,
    },
  });
}

export default async function authRoutes(app) {
  // Вход через Telegram Mini App
  app.post('/api/auth/telegram', async (req, reply) => {
    const { initData } = req.body || {};

    // Локальная разработка без Telegram: DEV_LOGIN + telegramId в теле
    if ((!initData || initData === 'dev') && config.devLogin) {
      const tgId = req.body?.telegramId || 0;
      let user = await ensureSuperadmin(tgId);
      if (!user) user = await prisma.user.findUnique({ where: { telegramId: BigInt(tgId) } });
      if (!user || !user.active) return reply.code(403).send({ error: 'not_allowed' });
      return { token: signSession(user), user: serializeUserPublic(user), caps: capabilities(user) };
    }

    const res = verifyInitData(initData, config.telegram.botToken, config.initDataMaxAgeSec);
    if (!res.ok) return reply.code(401).send({ error: 'invalid_init_data', reason: res.reason });

    const tgName = [res.user.first_name, res.user.last_name].filter(Boolean).join(' ').trim();

    // Суперадмин заходит даже без allow-list.
    let user = await ensureSuperadmin(res.user.id, tgName);
    if (!user) user = await prisma.user.findUnique({ where: { telegramId: BigInt(res.user.id) } });
    if (!user || !user.active) {
      return reply.code(403).send({ error: 'not_allowed' });
    }

    // Обновим имя/аватар из Telegram, если не заданы вручную.
    const patch = {};
    if (tgName && (!user.name || user.name === `User ${res.user.id}` || user.name === `Суперадмин ${res.user.id}`)) {
      patch.name = tgName;
      patch.initials = initialsFrom(tgName);
      patch.color = user.color || colorFor(tgName);
    }
    const fresh = Object.keys(patch).length
      ? await prisma.user.update({ where: { id: user.id }, data: patch })
      : user;

    return { token: signSession(fresh), user: serializeUserPublic(fresh), caps: capabilities(fresh) };
  });

  // Стартовая загрузка клиента.
  // Для суперадмина учитываем «просмотр от имени» (X-View-As): user/caps — от
  // эффективного пользователя, а флаг superadmin — от реального.
  app.get('/api/bootstrap', { preHandler: authGuard }, async (req) => {
    const team = await loadTeam();
    return {
      user: serializeUserPublic(req.user),
      caps: capabilities(req.user),
      superadmin: !!req.realUser?.superadmin,
      viewingAs: req.user.id,
      realUserId: req.realUser?.id,
      people: peopleMap(team),
      team: team.map(serializeUserPublic),
    };
  });

  app.get('/api/me', { preHandler: authGuard }, async (req) => ({
    user: serializeUserPublic(req.user),
    caps: capabilities(req.user),
    superadmin: !!req.realUser?.superadmin,
    viewingAs: req.user.id,
  }));
}

export { capabilities, loadTeam };
