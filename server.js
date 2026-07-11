/**
 * Punto de entrada opcional para hosting Node clásico (cPanel).
 * En Vercel/Netlify NO se usa: el runtime serverless arranca Next.js solo.
 */
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const path = require('path');
const { bootstrapDatabase } = require('./scripts/bootstrap-db');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const root = __dirname;

async function main() {
  if (process.env.SKIP_DB_BOOTSTRAP !== '1') {
    console.log('[server] Bootstrap DB...');
    await bootstrapDatabase();
  }

  const app = next({ dev, hostname, port, dir: root });
  const handle = app.getRequestHandler();
  await app.prepare();

  createServer(async (req, res) => {
    try {
      await handle(req, res, parse(req.url, true));
    } catch (err) {
      console.error('Error handling request', err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, () => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    console.log(`> WPS Admin ready on http://${hostname}:${port}${base}`);
  });
}

main().catch((err) => {
  console.error('[server] FATAL:', err);
  process.exit(1);
});
