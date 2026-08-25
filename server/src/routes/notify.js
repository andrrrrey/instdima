// Персональные настройки уведомлений: каждый пользователь редактирует свои.
import { authGuard } from '../auth/session.js';
import { prisma } from '../db.js';
import { resolvePrefs, sanitizePrefs } from '../util/notifyPrefs.js';

export default async function notifyRoutes(app) {
  app.addHook('preHandler', authGuard);

  app.get('/api/notify-prefs', async (req) => ({ prefs: resolvePrefs(req.user) }));

  app.patch('/api/notify-prefs', async (req, reply) => {
    const incoming = sanitizePrefs(req.body || {});
    if (!Object.keys(incoming).length) return reply.code(400).send({ error: 'bad_request' });
    const merged = { ...(req.user.notifyPrefs || {}), ...incoming };
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { notifyPrefs: merged },
    });
    return { prefs: resolvePrefs(updated) };
  });
}
