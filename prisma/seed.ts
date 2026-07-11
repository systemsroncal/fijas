import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SOURCES = [
  { name: 'Predictz', slug: 'predictz', baseUrl: 'https://www.predictz.com' },
  { name: 'WinDrawWin', slug: 'windrawwin', baseUrl: 'https://www.windrawwin.com' },
  { name: 'Scores24', slug: 'scores24', baseUrl: 'https://scores24.live' },
  { name: 'Soccer24', slug: 'soccer24', baseUrl: 'https://www.soccer24.com' },
  { name: 'OddsPortal', slug: 'oddsportal', baseUrl: 'https://www.oddsportal.com' },
  { name: 'Forebet', slug: 'forebet', baseUrl: 'https://www.forebet.com' },
  { name: '1960Tips', slug: '1960tips', baseUrl: 'https://www.1960tips.com' },
  { name: 'StatArea', slug: 'statarea', baseUrl: 'https://www.statarea.com' },
  { name: 'VictorsPredict', slug: 'victorspredict', baseUrl: 'https://www.victorspredict.com' },
  { name: 'MeritPredict', slug: 'meritpredict', baseUrl: 'https://www.meritpredict.com' },
  { name: 'SaferTip', slug: 'safertip', baseUrl: 'https://www.safertip.com' },
  { name: 'StakeGains', slug: 'stakegains', baseUrl: 'https://www.stakegains.com' },
  { name: 'NordicBet', slug: 'nordicbet', baseUrl: 'https://www.nordicbet.com' },
  { name: 'Betway', slug: 'betway', baseUrl: 'https://www.betway.com' },
];

async function main() {
  for (const source of SOURCES) {
    await prisma.scrapingSource.upsert({
      where: { slug: source.slug },
      create: source,
      update: { name: source.name, baseUrl: source.baseUrl },
    });
  }

  await prisma.sessionControl.upsert({
    where: { role: Role.SUBSCRIBER },
    create: { role: Role.SUBSCRIBER, maxSessions: 1, enforceSingleDevice: true },
    update: {},
  });

  await prisma.sessionControl.upsert({
    where: { role: Role.SUPERADMIN },
    create: { role: Role.SUPERADMIN, maxSessions: 5, enforceSingleDevice: false },
    update: {},
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'systems.roncal@gmail.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMeAdmin123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      username: 'superadmin',
      name: 'Super Admin',
      passwordHash,
      role: Role.SUPERADMIN,
      maxSessions: 5,
    },
    update: {
      passwordHash,
      role: Role.SUPERADMIN,
    },
  });

  console.log('Seed OK');
  console.log(`SuperAdmin: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
