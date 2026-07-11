# WPS Admin — Dashboard de Apuestas Deportivas

**Fecha:** 2026-07-10  
**Estado:** Aprobado  
**URL base:** `https://epicdreamsworld.com/wps-admin`  
**DB:** MySQL en el mismo cPanel (`localhost`)

## Decisiones

- Plantilla: Modernize Next.js Free (MUI + App Router)
- Auth: NextAuth.js Credentials + control de sesiones en MySQL (sin Redis)
- ORM: Prisma + MySQL (`localhost:3306`)
- Scrapers: Python + GitHub Actions → `POST /api/scraping/ingest`
- Deploy: cPanel Setup Node.js App + `server.js` + `output: 'standalone'`
- Tiempo real: polling 30s a `/api/matches/latest`

## Modelo de datos (resumen)

Users (NextAuth + role/maxSessions), Account, Session, VerificationToken,  
ApiKey, ScrapingSource, Match, ScrapedPrediction, Accumulator, AccumulatorMatch,  
SuggestedAccumulator, Analysis, SessionControl, RateLimit, SystemLog

## MySQL localhost

```
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/DB_NAME"
```

SSL opcional en localhost mismo servidor; si el hosting lo exige: `?sslaccept=strict`
