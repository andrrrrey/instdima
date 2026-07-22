// Сидирование: пользователи из ALLOWLIST, источники дайджеста из DIGEST_SOURCES.
// Идемпотентно — можно запускать повторно.
import { PrismaClient } from '@prisma/client';
import { config, parseAllowlist, parseDigestSources, parseSuperadminIds } from '../src/config.js';
import { initialsFrom, colorFor } from '../src/util/format.js';

const prisma = new PrismaClient();

const DEFAULT_RIGHTS = {
  owner: { createPub: true, seeAll: true, createTask: true },
  maker: { createPub: true, seeAll: true, createTask: false },
  customer: { createPub: false, seeAll: false, createTask: false },
  fashion: { createPub: false, seeAll: false, createTask: false },
};

async function seedUsers() {
  const entries = parseAllowlist();
  if (!entries.length) {
    console.log('[seed] ALLOWLIST пуст — пользователи не созданы.');
    return;
  }
  for (const e of entries) {
    const role = ['owner', 'maker', 'customer', 'fashion'].includes(e.role) ? e.role : 'maker';
    const telegramId = BigInt(e.telegramId);
    const existing = await prisma.user.findUnique({ where: { telegramId } });
    if (existing) {
      // не перетираем имя/права, если админ менял их в приложении — только гарантируем active
      await prisma.user.update({ where: { telegramId }, data: { active: true } });
      console.log(`[seed] пользователь ${e.telegramId} уже есть (${existing.role}).`);
      continue;
    }
    await prisma.user.create({
      data: {
        telegramId,
        name: e.name,
        initials: initialsFrom(e.name),
        color: colorFor(e.name),
        role,
        rights: DEFAULT_RIGHTS[role],
        active: true,
      },
    });
    console.log(`[seed] создан пользователь ${e.name} (${role}, tg=${e.telegramId}).`);
  }
}

async function seedSuperadmins() {
  const ids = parseSuperadminIds();
  for (const id of ids) {
    const telegramId = BigInt(id);
    const existing = await prisma.user.findUnique({ where: { telegramId } });
    if (existing) {
      await prisma.user.update({ where: { telegramId }, data: { superadmin: true, active: true } });
      console.log(`[seed] ${id} отмечен суперадмином.`);
    } else {
      const name = `Суперадмин ${id}`;
      await prisma.user.create({
        data: {
          telegramId, name, initials: initialsFrom(name), color: colorFor(name),
          role: 'owner', rights: { createPub: true, seeAll: true, createTask: true },
          active: true, superadmin: true,
        },
      });
      console.log(`[seed] создан суперадмин ${id}.`);
    }
  }
}

async function seedSources() {
  // Сеем источники только при пустой таблице (первичная настройка).
  // Дальше ими управляет владелец в приложении — редеплой их не трогает.
  const count = await prisma.digestSource.count();
  if (count > 0) {
    console.log(`[seed] источники уже заданы (${count}), пропускаю.`);
    return;
  }
  const sources = parseDigestSources();
  for (const s of sources) {
    await prisma.digestSource.create({
      data: { url: s.url, type: s.type, title: s.title, active: true },
    });
    console.log(`[seed] источник дайджеста: ${s.title}`);
  }
}

async function main() {
  await seedUsers();
  await seedSuperadmins();
  await seedSources();
  console.log('[seed] готово.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
