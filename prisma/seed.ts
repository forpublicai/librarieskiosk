import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashSync } from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const patronPassword = process.env.PATRON_PASSWORD || 'patron123';

    // Create libraries
    const pottsboro = await prisma.library.upsert({
        where: { name: 'Pottsboro, TX' },
        update: {},
        create: { name: 'Pottsboro, TX', weeklyPool: 1750, poolRemaining: 1750 },
    });
    console.log(`Library created/found: ${pottsboro.name}`);

    const salem = await prisma.library.upsert({
        where: { name: 'Salem City, UT' },
        update: {},
        create: { name: 'Salem City, UT', weeklyPool: 1750, poolRemaining: 1750 },
    });
    console.log(`Library created/found: ${salem.name}`);

    // Create admin user for Pottsboro
    const admin = await prisma.user.upsert({
        where: { username: 'admin_pottsboro' },
        update: { library: 'Pottsboro, TX', status: 'APPROVED' },
        create: {
            username: 'admin_pottsboro',
            passwordHash: hashSync(adminPassword, 10),
            library: 'Pottsboro, TX',
            role: 'ADMIN',
            status: 'APPROVED',
            credits: 1750,
        },
    });
    console.log(`Admin user created/found: ${admin.username} (${admin.id})`);

    // Create admin user for Salem City
    const salemAdmin = await prisma.user.upsert({
        where: { username: 'admin_salem' },
        update: {},
        create: {
            username: 'admin_salem',
            passwordHash: hashSync(adminPassword, 10),
            library: 'Salem City, UT',
            role: 'ADMIN',
            status: 'APPROVED',
            credits: 1750,
        },
    });
    console.log(`Salem admin created/found: ${salemAdmin.username} (${salemAdmin.id})`);

    // Create super admin user (System-wide)
    const superAdmin = await prisma.user.upsert({
        where: { username: 'superadmin' },
        update: { library: 'System', role: 'SUPER_ADMIN', status: 'APPROVED' },
        create: {
            username: 'superadmin',
            passwordHash: hashSync(adminPassword, 10),
            library: 'System',
            role: 'SUPER_ADMIN',
            status: 'APPROVED',
            credits: 9999,
        },
    });
    console.log(`Super admin created/found: ${superAdmin.username} (${superAdmin.id})`);

    // Create test patron
    const patron = await prisma.user.upsert({
        where: { username: 'patron' },
        update: {},
        create: {
            username: 'patron',
            passwordHash: hashSync(patronPassword, 10),
            library: 'Pottsboro, TX',
            role: 'PATRON',
            status: 'APPROVED',
            credits: 100,
        },
    });
    console.log(`Patron user created/found: ${patron.username} (${patron.id}), credits: ${patron.credits}`);

    // Create shared guest account (reusable, no content persistence)
    const guest = await prisma.user.upsert({
        where: { username: 'guest' },
        update: { status: 'APPROVED' },
        create: {
            username: 'guest',
            passwordHash: hashSync('guest_session', 10),
            library: 'Guest',
            role: 'GUEST',
            status: 'APPROVED',
            credits: 100,
        },
    });
    console.log(`Guest account created/found: ${guest.username} (${guest.id}), credits: ${guest.credits}`);

    // Migrate existing users to APPROVED status
    const migrated = await prisma.user.updateMany({
        where: { status: 'PENDING' },
        data: { status: 'APPROVED' },
    });
    if (migrated.count > 0) {
        console.log(`Migrated ${migrated.count} existing users to APPROVED status`);
    }

    console.log('\nSeed complete! You can log in with:');
    console.log('  Admin (Pottsboro): admin / ' + adminPassword);
    console.log('  Admin (Salem):     admin_salem / ' + adminPassword);
    console.log('  Super Admin:       superadmin / ' + adminPassword);
    console.log('  Patron:            patron / ' + patronPassword);
}

main()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
