import 'dotenv/config';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
    const lib = await prisma.library.upsert({
        where: { name: 'Public AI' },
        update: {},
        create: { name: 'Public AI', weeklyPool: 1750, poolRemaining: 1750 },
    });
    console.log(`Library: ${lib.name} (${lib.id})`);

    const superAdmin = await prisma.user.updateMany({
        where: { username: 'superadmin' },
        data: { library: 'Public AI' },
    });
    console.log(`superadmin moved: ${superAdmin.count}`);

    const patrons = await prisma.user.updateMany({
        where: { username: { in: ['patron', 'mohsin', 'mohsin_test'] } },
        data: { library: 'Public AI' },
    });
    console.log(`patrons moved: ${patrons.count}`);

    const remaining = await prisma.user.findMany({
        where: { username: { in: ['superadmin', 'patron', 'mohsin', 'mohsin_test'] } },
        select: { username: true, library: true, role: true },
    });
    console.table(remaining);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
