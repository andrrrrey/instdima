// Маршруты авторизации: вход через Telegram initData + bootstrap-данные.
import { config } from '../config.js';
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

export default async function authRoutes(app) {
  // Вход через Telegram Mini App
  app.post('/api/auth/telegram', async (req, reply) => {
    const { initData } = req.body || {};

    // Локальная разработка без Telegram: DEV_LOGIN + telegramId в теле
    if ((!initData || initData === 'dev') && config.devLogin) {
      const tg = BigInt(req.body?.telegramId || 0);
      const user = await prisma.user.findUnique({ where: { telegramId: tg } });
      if (!user || !user.active) return reply.code(403).send({ error: 'not_allowed' });
      return { token: signSession(user), user: serializeUserPublic(user), caps: capabilities(user) };
    }

    const res = verifyInitData(initData, config.telegram.botToken, config.initDataMaxAgeSec);
    if (!res.ok) return reply.code(401).send({ error: 'invalid_init_data', reason: res.reason });

    const tg = BigInt(res.user.id);
    const user = await prisma.user.findUnique({ where: { telegramId: tg } });
    if (!user || !user.active) {
      return reply.code(403).send({ error: 'not_allowed' });
    }

    // Обновим имя/аватар из Telegram, если поменялись и не заданы вручную.
    const tgName = [res.user.first_name, res.user.last_name].filter(Boolean).join(' ').trim();
    const patch = {};
    if (tgName && (!user.name || user.name === `User ${tg}`)) {
      patch.name = tgName;
      patch.initials = initialsFrom(tgName);
      patch.color = user.color || colorFor(tgName);
    }
    const fresh = Object.keys(patch).length
      ? await prisma.user.update({ where: { id: user.id }, data: patch })
      : user;

    return { token: signSession(fresh), user: serializeUserPublic(fresh), caps: capabilities(fresh) };
  });

  // Текущий пользователь + команда (people) + возможности — стартовая загрузка клиента.
  app.get('/api/bootstrap', { preHandler: authGuard }, async (req) => {
    const team = await loadTeam();
    return {
      user: serializeUserPublic(req.user),
      caps: capabilities(req.user),
      people: peopleMap(team),
      team: team.map(serializeUserPublic),
    };
  });

  app.get('/api/me', { preHandler: authGuard }, async (req) => ({
    user: serializeUserPublic(req.user),
    caps: capabilities(req.user),
  }));
}

export { capabilities, loadTeam };
