import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Migrating roles from MASTER_ADMIN to SUPER_ADMIN...');
    // We update the data in the database directly before schema sync. 
    // This is safe since Prisma values are stored as strings for enums in many PG setups.
    
    // We execute raw SQL because the Prisma client might not have the new role yet.
    const result = await prisma.$executeRawUnsafe(
        "UPDATE \"User\" SET role = 'SUPER_ADMIN' WHERE role = 'MASTER_ADMIN'"
    );
    console.log(`Updated ${result} users.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
