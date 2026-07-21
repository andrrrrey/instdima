// JWT-сессии и загрузка текущего пользователя.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';

export function signSession(user) {
  return jwt.sign(
    { uid: user.id, tg: String(user.telegramId), role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.ttl },
  );
}

export function verifySession(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

// Fastify-хук: проверяет JWT, грузит активного пользователя.
// req.realUser — реальный вошедший пользователь;
// req.user — «эффективный» (для суперадмина может быть выбранным через X-View-As).
export async function authGuard(req, reply) {
  const token = bearer(req);
  if (!token) return reply.code(401).send({ error: 'unauthorized' });
  const payload = verifySession(token);
  if (!payload) return reply.code(401).send({ error: 'invalid_token' });

  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user || !user.active) return reply.code(403).send({ error: 'forbidden' });

  req.realUser = user;
  req.user = user;

  // Суперадмин может «смотреть от имени» другого пользователя.
  if (user.superadmin) {
    const viewAs = req.headers['x-view-as'];
    if (viewAs && viewAs !== user.id) {
      const target = await prisma.user.findUnique({ where: { id: String(viewAs) } });
      if (target && target.active) {
        req.user = target;
        req.impersonating = true;
      }
    }
  }
}

// Ограничение по ролям: roleGuard('owner') или roleGuard('owner','maker')
export function roleGuard(...roles) {
  return async function (req, reply) {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'forbidden', need: roles });
    }
  };
}
