/**
 * Bootstrap de MySQL para build (Vercel/Netlify) o arranque cPanel.
 * - prisma db push (crea/actualiza tablas)
 * - seed SuperAdmin + fuentes de scraping
 *
 * En Vercel/Netlify se ejecuta en el build (ver vercel.json / netlify.toml).
 * Requiere DATABASE_URL apuntando al MySQL remoto de cPanel (NO localhost).
 */
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function run(cmd) {
  console.log(`[bootstrap] ${cmd}`);
  execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}

async function seedIfNeeded() {
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const prisma = new PrismaClient();

  try {
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

    for (const source of SOURCES) {
      await prisma.scrapingSource.upsert({
        where: { slug: source.slug },
        create: source,
        update: { name: source.name, baseUrl: source.baseUrl },
      });
    }

    await prisma.sessionControl.upsert({
      where: { role: 'SUBSCRIBER' },
      create: { role: 'SUBSCRIBER', maxSessions: 1, enforceSingleDevice: true },
      update: {},
    });
    await prisma.sessionControl.upsert({
      where: { role: 'SUPERADMIN' },
      create: { role: 'SUPERADMIN', maxSessions: 5, enforceSingleDevice: false },
      update: {},
    });

    const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@epicdreamsworld.com')
      .toLowerCase()
      .trim();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMeAdmin123!';
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (!existing) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await prisma.user.create({
        data: {
          email: adminEmail,
          username: 'superadmin',
          name: 'Super Admin',
          passwordHash,
          role: 'SUPERADMIN',
          maxSessions: 5,
        },
      });
      console.log(`[bootstrap] SuperAdmin creado: ${adminEmail}`);
    } else {
      console.log(`[bootstrap] SuperAdmin ya existe: ${adminEmail}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function bootstrapDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'Falta DATABASE_URL. Usa el host remoto de MySQL en cPanel (no localhost). Ejemplo: mysql://user:pass@epicdreamsworld.com:3306/db'
    );
  }

  if (process.env.DATABASE_URL.includes('@localhost') || process.env.DATABASE_URL.includes('@127.0.0.1')) {
    console.warn(
      '[bootstrap] AVISO: DATABASE_URL usa localhost. En Vercel/Netlify debe ser el host remoto de cPanel (Remote MySQL).'
    );
  }

  run('npx prisma db push');
  await seedIfNeeded();
  console.log('[bootstrap] Base de datos lista');
}

module.exports = { bootstrapDatabase };

if (require.main === module) {
  bootstrapDatabase().catch((err) => {
    console.error('[bootstrap] ERROR:', err);
    process.exit(1);
  });
}
