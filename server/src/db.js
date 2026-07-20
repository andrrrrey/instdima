// Единый инстанс Prisma-клиента.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

// BigInt (telegram_id) не сериализуется в JSON по умолчанию.
BigInt.prototype.toJSON = function toJSON() {
  return this.toString();
};
