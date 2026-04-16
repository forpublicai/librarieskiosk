import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
