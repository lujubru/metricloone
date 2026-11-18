import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

type LogLevel = 'query' | 'info' | 'warn' | 'error';

/**
 * En produccion el scheduler corre cada minuto y cada request hace varias
 * consultas: loguear todas las queries satura el visor de logs del contenedor
 * y tapa las lineas utiles. Se activa con PRISMA_LOG_QUERIES=true.
 */
function logLevels(): LogLevel[] {
  if (process.env.PRISMA_LOG_QUERIES === 'true') return ['query', 'warn', 'error'];
  return process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'warn', 'error'];
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: logLevels(),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
