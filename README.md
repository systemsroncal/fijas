# WPS Admin — Dashboard de Apuestas Deportivas

Next.js + Prisma + MySQL remoto (cPanel) + scrapers en GitHub Actions.  
Despliegue principal: **Vercel** o **Netlify** (serverless).

Repo: https://github.com/systemsroncal/fijas

## Stack

- Next.js 16 (App Router) + Modernize (MUI)
- NextAuth.js + Prisma (MySQL remoto)
- Sin Redis (sesiones y rate limit en MySQL)
- Scrapers Python → GitHub Actions cada 4h

## MySQL remoto (cPanel)

1. En cPanel → **Remote MySQL** → añade `%` (o los hosts de Vercel/Netlify).
2. Usa el **hostname público**, no `localhost`:

```env
DATABASE_URL="mysql://USER:PASS@epicdreamsworld.com:3306/DB_NAME?connection_limit=5"
```

Si el hosting bloquea conexiones externas, pide “Remote MySQL” o un host tipo `mysql.tudominio.com`.

## Variables de entorno (Vercel / Netlify)

| Variable | Ejemplo |
|----------|---------|
| `DATABASE_URL` | MySQL remoto cPanel |
| `NEXTAUTH_URL` | `https://tu-app.vercel.app` |
| `NEXTAUTH_SECRET` | ≥ 32 chars |
| `ENCRYPTION_KEY` | 64 hex chars |
| `API_SECRET` | secreto scraper |
| `SEED_ADMIN_EMAIL` | opcional |
| `SEED_ADMIN_PASSWORD` | opcional |

Opcional: `NEXT_PUBLIC_BASE_PATH=/wps-admin` solo si quieres subruta.

## Deploy en Vercel

1. Importa el repo `systemsroncal/fijas`
2. Framework: Next.js (usa `vercel.json`)
3. Añade las env vars
4. Deploy

El build ejecuta: `prisma generate` → `db push` + seed → `next build`

Login: `https://tu-app.vercel.app/login`  
Default: `admin@epicdreamsworld.com` / `ChangeMeAdmin123!`

## Deploy en Netlify

1. Importa el repo
2. Plugin `@netlify/plugin-nextjs` (en `netlify.toml`)
3. Mismas env vars
4. Deploy

## Local

```bash
cp .env.example .env.local
# Edita DATABASE_URL (remoto o local)
npm install
npx prisma generate
node scripts/bootstrap-db.js
npm run dev
```

## Scraping (GitHub Actions)

Secrets del repo:

- `BACKEND_URL` = URL de Vercel/Netlify (sin slash final)
- `API_SECRET` = mismo que en el hosting

Workflow: `.github/workflows/scraping.yml` (cada 4h + manual).

## Rutas

| Ruta | Descripción |
|------|-------------|
| `/login` | Login |
| `/dashboard` | Partidos de hoy |
| `/accumulators/suggested` | Combinadas sugeridas |
| `/accumulators/builder` | Creador |
| `/analyses` | Análisis IA |
| `/settings/api-keys` | Claves API |
| `/admin` | SuperAdmin |

## Seguridad

- APIs autenticadas (excepto login/register/ingest)
- Ingest con `API_SECRET`
- Rate limit MySQL 100 req/min
- API keys cifradas AES-256-GCM
- Headers de seguridad + sin source maps en prod
