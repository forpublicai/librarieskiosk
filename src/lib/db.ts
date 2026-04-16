import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
    _prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set');
    }
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
}

// Lazy-init: don't connect at module import time (breaks next build without a DB)
function getPrisma(): PrismaClient {
    if (!globalForPrisma._prisma) {
        globalForPrisma._prisma = createPrismaClient();
    }
    return globalForPrisma._prisma;
}

// Export as a proxy so callers can use `prisma.user.findMany(...)` directly
export const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop: string | symbol) {
        return Reflect.get(getPrisma(), prop);
    },
});
