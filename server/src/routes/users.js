// Управление командой и правами — только владелец (раздел «Ещё»).
import { z } from 'zod';
import { prisma } from '../db.js';
import { authGuard, roleGuard } from '../auth/session.js';
import { serializeUserPublic } from '../serializers.js';
import { initialsFrom, colorFor } from '../util/format.js';

const rightsSchema = z.object({
  createPub: z.boolean().optional(),
  seeAll: z.boolean().optional(),
  createTask: z.boolean().optional(),
});

const createSchema = z.object({
  telegramId: z.string().regex(/^\d+$/),
  name: z.string().min(1).max(120),
  role: z.enum(['owner', 'maker', 'customer', 'fashion']),
  rights: rightsSchema.optional(),
});

export default async function userRoutes(app) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', roleGuard('owner'));

  app.get('/api/users', async () => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return { items: users.map(serializeUserPublic) };
  });

  app.post('/api/users', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    const b = parsed.data;
    const telegramId = BigInt(b.telegramId);
    const exists = await prisma.user.findUnique({ where: { telegramId } });
    if (exists) return reply.code(409).send({ error: 'exists' });
    const user = await prisma.user.create({
      data: {
        telegramId,
        name: b.name,
        initials: initialsFrom(b.name),
        color: colorFor(b.name),
        role: b.role,
        rights: b.rights || { createPub: b.role !== 'customer', seeAll: b.role !== 'customer', createTask: false },
        active: true,
      },
    });
    return reply.code(201).send(serializeUserPublic(user));
  });

  app.patch('/api/users/:id', async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return reply.code(404).send({ error: 'not_found' });
    const b = req.body || {};
    const data = {};
    if (typeof b.name === 'string' && b.name.trim()) {
      data.name = b.name.trim();
      data.initials = initialsFrom(b.name);
    }
    if (['owner', 'maker', 'customer', 'fashion'].includes(b.role)) data.role = b.role;
    if (typeof b.active === 'boolean') data.active = b.active;
    if (b.rights) {
      const parsed = rightsSchema.safeParse(b.rights);
      if (parsed.success) data.rights = { ...(user.rights || {}), ...parsed.data };
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return serializeUserPublic(updated);
  });

  app.patch('/api/users/:id/rights', async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return reply.code(404).send({ error: 'not_found' });
    const parsed = rightsSchema.safeParse(req.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { rights: { ...(user.rights || {}), ...parsed.data } },
    });
    return serializeUserPublic(updated);
  });

  app.delete('/api/users/:id', async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return reply.code(404).send({ error: 'not_found' });
    if (user.id === req.user.id) return reply.code(400).send({ error: 'cannot_delete_self' });
    // Мягкое отключение доступа (сохраняем историю/авторство).
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    return { ok: true };
  });
}
