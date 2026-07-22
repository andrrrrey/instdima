// Отдача медиа по короткоживущему подписанному токену (работает с <img src>).
import { prisma } from '../db.js';
import { verifyMediaToken, getObjectStream, presignedUrl, storageDriver } from '../services/storage.js';

export default async function mediaRoutes(app) {
  app.get('/api/media/:id', async (req, reply) => {
    const { id } = req.params;
    const { token, frame } = req.query;
    if (!verifyMediaToken(id, token)) return reply.code(403).send({ error: 'bad_token' });

    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) return reply.code(404).send({ error: 'not_found' });

    const key = frame && media.framePath ? media.framePath : media.path;
    const mime = frame ? 'image/jpeg' : media.mime;

    // ?download=1 → отдать как вложение (для кнопки «Скачать»)
    const asDownload = req.query.download === '1' || req.query.download === 'true';
    const filename = `media-${media.id}.${media.kind === 'video' ? 'mp4' : 'jpg'}`;

    if (storageDriver === 's3') {
      const url = await presignedUrl(key, undefined, asDownload ? filename : undefined);
      return reply.redirect(url);
    }
    const stream = getObjectStream(key);
    if (!stream) return reply.code(404).send({ error: 'not_found' });
    reply.header('Content-Type', mime || 'application/octet-stream');
    reply.header('Cache-Control', 'private, max-age=3600');
    if (asDownload) reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(stream);
  });
}
