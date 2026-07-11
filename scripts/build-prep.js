/**
 * Preparación de build para Vercel/Netlify.
 * - Por defecto NO falla el build si MySQL no es alcanzable (SKIP_DB_BOOTSTRAP=1 en Netlify).
 * - Si SKIP_DB_BOOTSTRAP no está activo y hay DATABASE_URL, sincroniza schema + seed.
 */
const { bootstrapDatabase } = require('./bootstrap-db');

async function main() {
  if (process.env.SKIP_DB_BOOTSTRAP === '1') {
    console.log(
      '[build-prep] SKIP_DB_BOOTSTRAP=1 — se omite db push. Tras el deploy llama a POST /api/setup con X-API-Secret.'
    );
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.warn(
      '[build-prep] Sin DATABASE_URL: se omite bootstrap. Configura env vars y ejecuta POST /api/setup después del deploy.'
    );
    return;
  }

  try {
    await bootstrapDatabase();
  } catch (err) {
    console.error('[build-prep] Bootstrap falló:', err);
    console.error(
      [
        '',
        'Causas frecuentes:',
        '1) DATABASE_URL no configurada en Netlify/Vercel Environment variables',
        '2) MySQL en cPanel no permite conexiones remotas (Remote MySQL → añade %)',
        '3) Host incorrecto (no uses localhost; usa tu dominio o mysql.tudominio.com)',
        '',
        'Workaround: pon SKIP_DB_BOOTSTRAP=1 en el build y luego POST /api/setup',
      ].join('\n')
    );
    // En CI serverless no tumbar el build si la BD no responde; el setup se hace después
    if (process.env.VERCEL || process.env.NETLIFY || process.env.CI) {
      console.warn('[build-prep] Continuando el build sin DB. Usa POST /api/setup tras el deploy.');
      return;
    }
    process.exit(1);
  }
}

main();
