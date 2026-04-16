import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Cleaning up masteradmin before role rename...');
    const result = await prisma.user.deleteMany({
        where: {
            OR: [
                { username: 'masteradmin' },
                { role: 'MASTER_ADMIN' as any }
            ]
        }
    });
    console.log(`Deleted ${result.count} users.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
