# Graph Report - fijas  (2026-07-15)

## Corpus Check
- 153 files · ~95,384 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 886 nodes · 1646 edges · 93 communities (54 shown, 39 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 61 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1eb422b1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- client.ts
- match-display.ts
- requireAuth
- route.ts
- PageContainer.tsx
- generic.py
- base.py
- scripts
- compilerOptions
- server.js
- MatchAnalysisDashboard.tsx
- providers.ts
- layout.tsx
- MatchResultStatsPanel.tsx
- assets.d.ts
- dependencies
- main.py
- next-auth.d.ts
- react
- data.tsx
- layout.tsx
- seed.ts
- vercel.json
- .eslintrc.json
- apexcharts
- bcryptjs
- @emotion/cache
- @emotion/react
- @emotion/server
- @emotion/styled
- eslint
- eslint-config-next
- @mui/lab
- @mui/material
- @netlify/plugin-nextjs
- next
- next-auth
- next.config.js
- prisma
- react-apexcharts
- react-dom
- react-mui-sidebar
- react-syntax-highlighter
- @tabler/icons-react
- @types/lodash
- @types/node
- typescript
- zod
- react-mui-sidebar.d.ts
- middleware.ts
- theme.ts
- match-status.ts
- page.tsx
- page.tsx
- paths.ts
- AccumulatorAnalysisCard.tsx
- BlankCard.tsx
- MonthlyEarnings.tsx
- ProductPerformance.tsx
- YearlyBreakup.tsx
- CLAUDE.md
- BeautifulSoup
- random_ua
- .scrape
- exponential_retry
- cuotasahora.py
- fbref.py
- FlashscoreScraper
- PredictzScraper
- Scores24Scraper
- scores365.py
- theanalyst.py
- windrawwin.py
- WPS Admin — Dashboard de Apuestas Deportivas
- forebet.py
- html-to-image
- lodash
- @mui/icons-material
- espn_yahoo.py
- nba.py
- oddsportal.py
- ProductPerformance.tsx
- YearlyBreakup.tsx
- amqplib
- @emotion/react
- framer-motion

## God Nodes (most connected - your core abstractions)
1. `apiUrl()` - 28 edges
2. `requireAuth()` - 26 edges
3. `POST()` - 25 edges
4. `GenericTipsScraper` - 23 edges
5. `isJunkMatch()` - 23 edges
6. `buildModelPayload()` - 21 edges
7. `PageContainer()` - 19 edges
8. `repairMisparsedMatch()` - 18 edges
9. `localDateISO()` - 17 edges
10. `fetchMatchStatus()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `test_empty_result_shape()` --calls--> `empty_result()`  [INFERRED]
  scrapers/tests/test_base.py → scrapers/sites/base.py
- `MeritPredictScraper` --uses--> `GenericTipsScraper`  [INFERRED]
  scrapers/sites/meritpredict.py → scrapers/sites/generic.py
- `SaferTipScraper` --uses--> `GenericTipsScraper`  [INFERRED]
  scrapers/sites/safertip.py → scrapers/sites/generic.py
- `Soccer24Scraper` --uses--> `GenericTipsScraper`  [INFERRED]
  scrapers/sites/soccer24.py → scrapers/sites/generic.py
- `StakeGainsScraper` --uses--> `GenericTipsScraper`  [INFERRED]
  scrapers/sites/stakegains.py → scrapers/sites/generic.py

## Import Cycles
- None detected.

## Communities (93 total, 39 thin omitted)

### Community 0 - "client.ts"
Cohesion: 0.07
Nodes (61): isMatchStillOpen(), localDateISO(), parseKickoffHm(), apiKey(), cache, CacheEntry, eventsOnDay(), EventsResponse (+53 more)

### Community 1 - "match-display.ts"
Cohesion: 0.24
Nodes (18): AccumulatorBuilderPage(), MatchRow, SelectedMatch, DashboardPage(), MatchRow, LiveMatchesPoller(), formatMarketLabel(), formatReadablePick() (+10 more)

### Community 2 - "requireAuth"
Cohesion: 0.07
Nodes (43): createSchema, GET(), POST(), GET(), GET(), GET(), PATCH(), patchSchema (+35 more)

### Community 3 - "route.ts"
Cohesion: 0.09
Nodes (46): buildAnalysisBrief(), sanitizeNarrative(), withBrief(), AiAttemptLog, AnalysisBrief, AnalysisMarket, AnalysisPick, ProposedAccumulator (+38 more)

### Community 4 - "PageContainer.tsx"
Cohesion: 0.10
Nodes (10): Suggested, SuggestedAccumulatorsPage(), AdminLogsPage(), Log, PageContainer(), Props, Props, darkTheme (+2 more)

### Community 5 - "generic.py"
Cohesion: 0.14
Nodes (13): ABC, BaseHtmlScraper, _guess_teams(), _is_meta_cell(), Scraper genérico basado en BeautifulSoup para sitios sin Cloudflare., Clase base para scrapers HTML., Construye URLs a scrapear (hoy/mañana cuando aplique)., True si la celda es hora/fecha/número, no un nombre de equipo. (+5 more)

### Community 6 - "base.py"
Cohesion: 0.39
Nodes (5): NordicBetScraper, _num(), Any, NordicBet — peticiones a API interna., Intenta consumir endpoints públicos/internal de NordicBet.

### Community 7 - "scripts"
Cohesion: 0.05
Nodes (39): jest, devDependencies, jest, ts-jest, tsx, @types/amqplib, @types/bcryptjs, @types/jest (+31 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 9 - "server.js"
Cohesion: 0.13
Nodes (17): @prisma/client, @prisma/client, bootstrapDatabase(), { execSync }, path, ROOT, run(), seedIfNeeded() (+9 more)

### Community 10 - "MatchAnalysisDashboard.tsx"
Cohesion: 0.07
Nodes (46): attachSources(), cornersFromDiagnostics(), GET(), LegJson, loadTeamForm(), POST(), requireLlmKey(), schema (+38 more)

### Community 11 - "providers.ts"
Cohesion: 0.16
Nodes (17): AI_PROVIDERS, AnalysisResult, analyzeAccumulatorWithFallback(), callOpenAiCompatOnce(), callProvider(), ChatMessage, GEMINI_MODEL_FALLBACKS, geminiGenerateUrl() (+9 more)

### Community 12 - "layout.tsx"
Cohesion: 0.14
Nodes (7): ItemType, MainWrapper, PageWrapper, Menuitems, ItemType, renderMenuItems(), SidebarItems()

### Community 13 - "MatchResultStatsPanel.tsx"
Cohesion: 0.12
Nodes (22): GET(), Chart, MatchAnalysisDashboard(), TeamBadge(), verdictColor, FOCUS_STATS, MatchResultStatsPanel(), parseStatNum() (+14 more)

### Community 14 - "assets.d.ts"
Cohesion: 0.20
Nodes (9): *.jpeg, *.jpg, *.png, react-syntax-highlighter, react-syntax-highlighter/dist/cjs/styles/hljs, react-syntax-highlighter/dist/esm/styles/hljs, react-syntax-highlighter/dist/esm/styles/prism, *.svg (+1 more)

### Community 16 - "main.py"
Cohesion: 0.28
Nodes (8): ingest(), main(), Any, Orquestador de scraping WPS Admin.  Ejecuta scrapers de todas las fuentes regi, Envía predicciones al endpoint de ingesta del backend.      Args:         bac, Ejecuta scrapers y publica resultados.      Args:         source_filter: slug, Punto de entrada CLI., run()

### Community 17 - "next-auth.d.ts"
Cohesion: 0.33
Nodes (5): JWT, next-auth, next-auth/jwt, Session, User

### Community 18 - "react"
Cohesion: 0.40
Nodes (4): react, react, Chart, SalesOverview()

### Community 19 - "data.tsx"
Cohesion: 0.40
Nodes (4): appsLink, notifications, pageLinks, profile

### Community 22 - "vercel.json"
Cohesion: 0.50
Nodes (3): buildCommand, framework, installCommand

### Community 24 - "apexcharts"
Cohesion: 0.18
Nodes (11): apexcharts, eslint-config-next, kafkajs, dependencies, apexcharts, eslint-config-next, kafkajs, react-apexcharts (+3 more)

### Community 27 - "@emotion/react"
Cohesion: 0.13
Nodes (8): Scraper Flashscore.pe / Flashscore livescore., Registro de scrapers por slug., MeritPredictScraper, NflScraper, NFL.com — scores / schedule., Scraper Predictz (hoy/mañana + acumuladas ES)., Soccer24Scraper, Tips1960Scraper

### Community 31 - "eslint-config-next"
Cohesion: 0.24
Nodes (21): GET(), phaseFromEvent(), POST(), GET(), formatFemeninoLabel(), repairMisparsedMatch(), splitVs(), SportsDbEvent (+13 more)

### Community 39 - "react-apexcharts"
Cohesion: 0.16
Nodes (14): BeautifulSoup, empty_result(), fetch_html(), Any, random_delay(), Obtiene HTML con requests + UA rotativo.      Args:         url: URL a consul, Parsea BeautifulSoup desde una URL., Retraso aleatorio anti-bot. (+6 more)

### Community 45 - "@types/node"
Cohesion: 0.17
Nodes (14): bodySchema, POST(), predictionSchema, POST(), validateApiSecret(), buildMatchKey(), normalizeTeam(), driver() (+6 more)

### Community 58 - "match-status.ts"
Cohesion: 0.22
Nodes (6): ForebetScraper, Forebet multi-deporte: fútbol, basket, tenis, hockey, handball, vóley., GenericTipsScraper, Scraper genérico: intenta extraer filas de tablas con equipos., StatAreaScraper, VictorsPredictScraper

### Community 59 - "page.tsx"
Cohesion: 0.14
Nodes (5): loginType, registerType, CustomTextField, Logo(), RegisterPage()

### Community 60 - "page.tsx"
Cohesion: 0.17
Nodes (13): Accumulator, AnalysesPage(), Analysis, historyModeFor(), isMatchDashboardPayload(), MatchOpt, Mode, SubTab (+5 more)

### Community 61 - "paths.ts"
Cohesion: 0.18
Nodes (8): AdminScrapersPage(), Source, AdminSessionsPage(), Control, AdminUsersPage(), UserRow, AuthProvider(), getBasePath()

### Community 62 - "AccumulatorAnalysisCard.tsx"
Cohesion: 0.18
Nodes (10): Deploy en Netlify, Deploy en Vercel, Local, MySQL remoto (cPanel), Rutas, Scraping (GitHub Actions), Seguridad, Stack (+2 more)

### Community 65 - "ProductPerformance.tsx"
Cohesion: 0.22
Nodes (5): Any, Parsea predicciones desde una URL. Override en subclases., Ejecuta scraping completo., Inferir fecha del partido desde la URL (hoy / mañana / YYYY-MM-DD)., _sport_from_url()

### Community 66 - "YearlyBreakup.tsx"
Cohesion: 0.25
Nodes (7): Disclaimer, Diseño: Análisis IA híbrido (partido / combinada / aleatorio), Fuera de alcance, Modos API `POST /api/analyses`, Objetivo, Persistencia, UI

### Community 68 - "BeautifulSoup"
Cohesion: 0.36
Nodes (4): FootballDataScraper, Any, Scraper / sync football-data.org API v4 (plan free)., Ingesta fixtures/resultados vía API (X-Auth-Token).

### Community 69 - "random_ua"
Cohesion: 0.38
Nodes (4): BetwayScraper, Any, Betway — peticiones a API interna multi-deporte., Consume endpoints internos/públicos de Betway cuando estén disponibles.

### Community 70 - ".scrape"
Cohesion: 0.31
Nodes (5): Any, Scraper SofaScore (ES)., SofaScore — partidos del día (HTML + API pública si responde)., Intenta API pública scheduled-events (puede fallar por anti-bot)., SofascoreScraper

### Community 71 - "exponential_retry"
Cohesion: 0.18
Nodes (9): exponential_retry(), Utilidades compartidas de scraping., Reintentos con espera 5s, 10s, 30s.      Args:         fn: Callable sin argum, GoogleSportsSearchScraper, Búsquedas deportivas (DuckDuckGo HTML) — proxy de 'Google search' sin API key., Consultas de tipsters vía DuckDuckGo HTML (más estable que scrapear Google SERP), Tests unitarios de utilidades de scraping., test_empty_result_shape() (+1 more)

### Community 72 - "cuotasahora.py"
Cohesion: 0.33
Nodes (4): CuotasAhoraScraper, Any, Scraper CuotasAhora — comparación de cuotas., CuotasAhora.com — odds comparison.

### Community 73 - "fbref.py"
Cohesion: 0.33
Nodes (4): FbrefScraper, Any, Scraper FBref — partidos y estadísticas., FBref.com — fixtures / matches del día.

### Community 74 - "FlashscoreScraper"
Cohesion: 0.32
Nodes (5): random_ua(), Devuelve un User-Agent aleatorio., FlashscoreScraper, Any, Flashscore — resultados y partidos (PE + EN).

### Community 75 - "PredictzScraper"
Cohesion: 0.53
Nodes (3): PredictzScraper, Any, Predictz predictions tipster + acumuladas en español.

### Community 76 - "Scores24Scraper"
Cohesion: 0.32
Nodes (4): Any, Scraper Scores24 con bypass Cloudflare (cloudscraper) — multi-deporte., Scores24.live — varias rutas de deporte., Scores24Scraper

### Community 77 - "scores365.py"
Cohesion: 0.33
Nodes (4): Any, Scraper 365Scores (ES)., 365Scores — marcadores y partidos del día., Scores365Scraper

### Community 78 - "theanalyst.py"
Cohesion: 0.33
Nodes (4): Any, Scraper Opta Analyst / TheAnalyst., Opta Analyst — artículos y stats (contexto cualitativo)., TheAnalystScraper

### Community 79 - "windrawwin.py"
Cohesion: 0.33
Nodes (4): Any, Scraper WinDrawWin (hoy y mañana)., WinDrawWin football predictions., WinDrawWinScraper

### Community 80 - "WPS Admin — Dashboard de Apuestas Deportivas"
Cohesion: 0.40
Nodes (4): Decisiones, Modelo de datos (resumen), MySQL localhost, WPS Admin — Dashboard de Apuestas Deportivas

### Community 81 - "forebet.py"
Cohesion: 0.38
Nodes (6): AccumulatorAnalysisCard(), AccumulatorResultView, LegLine, ParsedAi, parseLegs(), tryParseAiJson()

### Community 85 - "espn_yahoo.py"
Cohesion: 0.50
Nodes (3): EspnYahooScraper, Scraper ESPN + Yahoo Sports (scoreboards multi-deporte)., ESPN scoreboard API + Yahoo Sports HTML.

## Knowledge Gaps
- **230 isolated node(s):** `extends`, `next/core-web-vitals`, `nextConfig`, `name`, `version` (+225 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `apexcharts` to `scripts`, `server.js`, `dependencies`, `react`, `bcryptjs`, `@emotion/cache`, `@emotion/server`, `@emotion/styled`, `eslint`, `@mui/lab`, `@mui/material`, `@netlify/plugin-nextjs`, `next`, `next-auth`, `prisma`, `react-dom`, `react-mui-sidebar`, `react-syntax-highlighter`, `@tabler/icons-react`, `@types/lodash`, `typescript`, `zod`, `html-to-image`, `lodash`, `@mui/icons-material`, `amqplib`, `@emotion/react`, `framer-motion`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `apexcharts`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Are the 17 inferred relationships involving `GenericTipsScraper` (e.g. with `CuotasAhoraScraper` and `FbrefScraper`) actually correct?**
  _`GenericTipsScraper` has 17 INFERRED edges - model-reasoned connections that need verification._
- **What connects `extends`, `next/core-web-vitals`, `nextConfig` to the rest of the system?**
  _230 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `client.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07055630936227951 - nodes in this community are weakly interconnected._
- **Should `requireAuth` be split into smaller, more focused modules?**
  _Cohesion score 0.06610259122157588 - nodes in this community are weakly interconnected._
- **Should `route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0942684766214178 - nodes in this community are weakly interconnected._