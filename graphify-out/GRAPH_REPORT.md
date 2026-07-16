# Graph Report - fijas  (2026-07-16)

## Corpus Check
- 153 files · ~95,825 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 896 nodes · 1464 edges · 99 communities (63 shown, 36 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7a7139d2`
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
- nfl.py
- media-proxy.ts
- page.tsx
- match-key.ts
- apexcharts
- page.tsx

## God Nodes (most connected - your core abstractions)
1. `apiUrl()` - 26 edges
2. `requireAuth()` - 23 edges
3. `PageContainer()` - 18 edges
4. `compilerOptions` - 17 edges
5. `POST()` - 16 edges
6. `POST()` - 16 edges
7. `GenericTipsScraper` - 15 edges
8. `requireSuperAdmin()` - 15 edges
9. `fetchMatchStatus()` - 15 edges
10. `buildModelPayload()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `bootstrapDatabase()`  [EXTRACTED]
  server.js → scripts/bootstrap-db.js
- `seedIfNeeded()` --references--> `@prisma/client`  [EXTRACTED]
  scripts/bootstrap-db.js → package.json
- `SalesOverview()` --references--> `react`  [EXTRACTED]
  src/app/(DashboardLayout)/components/dashboard/SalesOverview.tsx → package.json
- `test_empty_result_shape()` --calls--> `empty_result()`  [INFERRED]
  scrapers/tests/test_base.py → scrapers/sites/base.py
- `ForebetScraper` --uses--> `GenericTipsScraper`  [INFERRED]
  scrapers/sites/forebet.py → scrapers/sites/generic.py

## Import Cycles
- None detected.

## Communities (99 total, 36 thin omitted)

### Community 0 - "client.ts"
Cohesion: 0.08
Nodes (46): apiKey(), cache, CacheEntry, EventsResponse, EventStatsResponse, lookupEvent(), lookupEventStats(), lookupEventTimeline() (+38 more)

### Community 1 - "match-display.ts"
Cohesion: 0.15
Nodes (14): Chart, MatchAnalysisDashboard(), verdictColor, buildAnalysisBrief(), sanitizeNarrative(), withBrief(), AiAttemptLog, AnalysisBrief (+6 more)

### Community 2 - "requireAuth"
Cohesion: 0.06
Nodes (44): createSchema, GET(), POST(), GET(), GET(), GET(), PATCH(), patchSchema (+36 more)

### Community 3 - "route.ts"
Cohesion: 0.24
Nodes (17): applyLlmJson(), buildDeepPrompt(), buildModelPayload(), buildRandomScannerPayload(), buildSameMatchGapAccumulators(), clamp(), edgeToMarket(), enrichPayloadWithLlm() (+9 more)

### Community 4 - "PageContainer.tsx"
Cohesion: 0.18
Nodes (3): PageContainer(), Props, Logo()

### Community 5 - "generic.py"
Cohesion: 0.19
Nodes (11): ABC, BaseHtmlScraper, _guess_teams(), _is_meta_cell(), Scraper genérico basado en BeautifulSoup para sitios sin Cloudflare., Clase base para scrapers HTML., Construye URLs a scrapear (hoy/mañana cuando aplique)., True si la celda es hora/fecha/número, no un nombre de equipo. (+3 more)

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
Cohesion: 0.16
Nodes (19): CacheEntry, fdGet(), FdMatch, FdStandingRow, FdTeamMatches, fetchStandings(), fetchTeamMatches(), fetchTodaysMatches() (+11 more)

### Community 11 - "providers.ts"
Cohesion: 0.16
Nodes (17): AI_PROVIDERS, AnalysisResult, analyzeAccumulatorWithFallback(), callOpenAiCompatOnce(), callProvider(), ChatMessage, GEMINI_MODEL_FALLBACKS, geminiGenerateUrl() (+9 more)

### Community 12 - "layout.tsx"
Cohesion: 0.14
Nodes (7): ItemType, MainWrapper, PageWrapper, Menuitems, ItemType, renderMenuItems(), SidebarItems()

### Community 13 - "MatchResultStatsPanel.tsx"
Cohesion: 0.15
Nodes (15): FOCUS_STATS, MatchResultStatsPanel(), parseStatNum(), phaseColor, phaseLabel, pickFocusStats(), StatCompareRow(), MatchStatusPayload (+7 more)

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
Nodes (11): eslint-config-next, framer-motion, kafkajs, dependencies, eslint-config-next, framer-motion, kafkajs, react-apexcharts (+3 more)

### Community 27 - "@emotion/react"
Cohesion: 0.10
Nodes (14): Scraper Flashscore.pe / Flashscore livescore., GenericTipsScraper, Scraper genérico: intenta extraer filas de tablas con equipos., Registro de scrapers por slug., MeritPredictScraper, OddsPortalScraper, OddsPortal: varias disciplinas para ampliar cobertura de torneos., Scraper Predictz (hoy/mañana + acumuladas ES). (+6 more)

### Community 31 - "eslint-config-next"
Cohesion: 0.10
Nodes (46): GET(), querySchema, phaseFromEvent(), POST(), GET(), AccumulatorBuilderPage(), MatchRow, SelectedMatch (+38 more)

### Community 39 - "react-apexcharts"
Cohesion: 0.22
Nodes (10): BeautifulSoup, fetch_html(), random_delay(), random_ua(), Utilidades compartidas de scraping., Devuelve un User-Agent aleatorio., Obtiene HTML con requests + UA rotativo.      Args:         url: URL a consul, Parsea BeautifulSoup desde una URL. (+2 more)

### Community 45 - "@types/node"
Cohesion: 0.26
Nodes (10): bodySchema, POST(), predictionSchema, driver(), MqDriver, MqEvent, mqPublish(), mqStatus() (+2 more)

### Community 59 - "page.tsx"
Cohesion: 0.19
Nodes (4): loginType, registerType, CustomTextField, RegisterPage()

### Community 60 - "page.tsx"
Cohesion: 0.15
Nodes (11): Accumulator, AnalysesPage(), Analysis, historyModeFor(), isMatchDashboardPayload(), MatchOpt, Mode, SubTab (+3 more)

### Community 61 - "paths.ts"
Cohesion: 0.15
Nodes (15): Suggested, SuggestedAccumulatorsPage(), AdminLogsPage(), Log, AdminScrapersPage(), Source, AdminSessionsPage(), Control (+7 more)

### Community 62 - "AccumulatorAnalysisCard.tsx"
Cohesion: 0.18
Nodes (10): Deploy en Netlify, Deploy en Vercel, Local, MySQL remoto (cPanel), Rutas, Scraping (GitHub Actions), Seguridad, Stack (+2 more)

### Community 64 - "MonthlyEarnings.tsx"
Cohesion: 0.14
Nodes (4): Chart, products, Chart, Props

### Community 65 - "ProductPerformance.tsx"
Cohesion: 0.22
Nodes (5): Any, Parsea predicciones desde una URL. Override en subclases., Ejecuta scraping completo., Inferir fecha del partido desde la URL (hoy / mañana / YYYY-MM-DD)., _sport_from_url()

### Community 66 - "YearlyBreakup.tsx"
Cohesion: 0.25
Nodes (7): Disclaimer, Diseño: Análisis IA híbrido (partido / combinada / aleatorio), Fuera de alcance, Modos API `POST /api/analyses`, Objetivo, Persistencia, UI

### Community 68 - "BeautifulSoup"
Cohesion: 0.14
Nodes (20): AccumulatorAnalysisCard(), AccumulatorResultView, LegLine, ParsedAi, parseLegs(), tryParseAiJson(), clamp(), computeEdge() (+12 more)

### Community 69 - "random_ua"
Cohesion: 0.38
Nodes (4): BetwayScraper, Any, Betway — peticiones a API interna multi-deporte., Consume endpoints internos/públicos de Betway cuando estén disponibles.

### Community 70 - ".scrape"
Cohesion: 0.31
Nodes (5): Any, Scraper SofaScore (ES)., SofaScore — partidos del día (HTML + API pública si responde)., Intenta API pública scheduled-events (puede fallar por anti-bot)., SofascoreScraper

### Community 71 - "exponential_retry"
Cohesion: 0.22
Nodes (8): empty_result(), exponential_retry(), Any, Reintentos con espera 5s, 10s, 30s.      Args:         fn: Callable sin argum, Resultado vacío estándar., Tests unitarios de utilidades de scraping., test_empty_result_shape(), test_exponential_retry_success()

### Community 72 - "cuotasahora.py"
Cohesion: 0.29
Nodes (5): CuotasAhoraScraper, Any, GenericTipsScraper, Scraper CuotasAhora — comparación de cuotas., CuotasAhora.com — odds comparison.

### Community 73 - "fbref.py"
Cohesion: 0.29
Nodes (5): FbrefScraper, Any, GenericTipsScraper, Scraper FBref — partidos y estadísticas., FBref.com — fixtures / matches del día.

### Community 74 - "FlashscoreScraper"
Cohesion: 0.38
Nodes (4): FlashscoreScraper, Any, GenericTipsScraper, Flashscore — resultados y partidos (PE + EN).

### Community 75 - "PredictzScraper"
Cohesion: 0.43
Nodes (4): BaseHtmlScraper, PredictzScraper, Any, Predictz predictions tipster + acumuladas en español.

### Community 76 - "Scores24Scraper"
Cohesion: 0.32
Nodes (4): Any, Scraper Scores24 con bypass Cloudflare (cloudscraper) — multi-deporte., Scores24.live — varias rutas de deporte., Scores24Scraper

### Community 77 - "scores365.py"
Cohesion: 0.29
Nodes (5): Any, GenericTipsScraper, Scraper 365Scores (ES)., 365Scores — marcadores y partidos del día., Scores365Scraper

### Community 78 - "theanalyst.py"
Cohesion: 0.29
Nodes (5): Any, GenericTipsScraper, Scraper Opta Analyst / TheAnalyst., Opta Analyst — artículos y stats (contexto cualitativo)., TheAnalystScraper

### Community 79 - "windrawwin.py"
Cohesion: 0.29
Nodes (5): Any, GenericTipsScraper, Scraper WinDrawWin (hoy y mañana)., WinDrawWin football predictions., WinDrawWinScraper

### Community 80 - "WPS Admin — Dashboard de Apuestas Deportivas"
Cohesion: 0.40
Nodes (4): Decisiones, Modelo de datos (resumen), MySQL localhost, WPS Admin — Dashboard de Apuestas Deportivas

### Community 81 - "forebet.py"
Cohesion: 0.36
Nodes (4): FootballDataScraper, Any, Scraper / sync football-data.org API v4 (plan free)., Ingesta fixtures/resultados vía API (X-Auth-Token).

### Community 85 - "espn_yahoo.py"
Cohesion: 0.33
Nodes (4): EspnYahooScraper, Any, Scraper ESPN + Yahoo Sports (scoreboards multi-deporte)., ESPN scoreboard API + Yahoo Sports HTML.

### Community 86 - "nba.py"
Cohesion: 0.33
Nodes (4): NbaScraper, Any, GenericTipsScraper, NBA.com — scoreboard / schedule.

### Community 87 - "oddsportal.py"
Cohesion: 0.21
Nodes (14): attachSources(), cornersFromDiagnostics(), LegJson, loadTeamForm(), POST(), requireLlmKey(), schema, scoresFromPayload() (+6 more)

### Community 88 - "ProductPerformance.tsx"
Cohesion: 0.33
Nodes (9): FormMatchRow, TeamFormBlock, applySportsDbToPayload(), enrichMatchFromSportsDb(), eventScore(), fallbackForm(), mapLastEvents(), mergeFormWithSportsDb() (+1 more)

### Community 89 - "YearlyBreakup.tsx"
Cohesion: 0.52
Nodes (6): exportNodeToPng(), flattenComputedColors(), monogramDataUrl(), stripBrokenMedia(), wait(), teamMonogram()

### Community 92 - "framer-motion"
Cohesion: 0.33
Nodes (4): GoogleSportsSearchScraper, Any, Búsquedas deportivas (DuckDuckGo HTML) — proxy de 'Google search' sin API key., Consultas de tipsters vía DuckDuckGo HTML (más estable que scrapear Google SERP)

### Community 93 - "nfl.py"
Cohesion: 0.33
Nodes (4): NflScraper, Any, GenericTipsScraper, NFL.com — scores / schedule.

### Community 94 - "media-proxy.ts"
Cohesion: 0.60
Nodes (4): GET(), ALLOWED_HOSTS, isAllowedMediaHost(), proxiedMediaUrl()

### Community 95 - "page.tsx"
Cohesion: 0.47
Nodes (4): ApiKeysSettingsPage(), SavedKey, AI_HELP, AI_PROVIDERS

### Community 98 - "page.tsx"
Cohesion: 0.40
Nodes (3): darkTheme, Item, lightTheme

## Knowledge Gaps
- **239 isolated node(s):** `Accumulator`, `Suggested`, `MatchOpt`, `Analysis`, `Mode` (+234 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `apexcharts` to `scripts`, `server.js`, `dependencies`, `react`, `bcryptjs`, `@emotion/cache`, `@emotion/server`, `@emotion/styled`, `eslint`, `@mui/lab`, `@mui/material`, `@netlify/plugin-nextjs`, `next`, `next-auth`, `prisma`, `react-dom`, `react-mui-sidebar`, `react-syntax-highlighter`, `@tabler/icons-react`, `@types/lodash`, `typescript`, `zod`, `html-to-image`, `lodash`, `@mui/icons-material`, `amqplib`, `@emotion/react`, `apexcharts`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `apexcharts`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **What connects `Accumulator`, `Suggested`, `MatchOpt` to the rest of the system?**
  _239 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `client.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0792156862745098 - nodes in this community are weakly interconnected._
- **Should `requireAuth` be split into smaller, more focused modules?**
  _Cohesion score 0.06299603174603174 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._