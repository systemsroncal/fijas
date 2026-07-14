# Graph Report - .  (2026-07-14)

## Corpus Check
- 151 files · ~88,003 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 734 nodes · 1391 edges · 58 communities (28 shown, 30 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- match-status.ts
- match-display.ts
- requireAuth()
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

## God Nodes (most connected - your core abstractions)
1. `apiUrl()` - 28 edges
2. `requireAuth()` - 26 edges
3. `isJunkMatch()` - 23 edges
4. `POST()` - 21 edges
5. `buildModelPayload()` - 21 edges
6. `PageContainer()` - 19 edges
7. `repairMisparsedMatch()` - 18 edges
8. `localDateISO()` - 17 edges
9. `fetchMatchStatus()` - 17 edges
10. `compilerOptions` - 17 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `bootstrapDatabase()`  [EXTRACTED]
  server.js → scripts/bootstrap-db.js
- `seedIfNeeded()` --references--> `@prisma/client`  [EXTRACTED]
  scripts/bootstrap-db.js → package.json
- `SalesOverview()` --references--> `react`  [EXTRACTED]
  src/app/(DashboardLayout)/components/dashboard/SalesOverview.tsx → package.json
- `test_empty_result_shape()` --calls--> `empty_result()`  [INFERRED]
  scrapers/tests/test_base.py → scrapers/sites/base.py
- `PredictzScraper` --uses--> `BaseHtmlScraper`  [INFERRED]
  scrapers/sites/predictz.py → scrapers/sites/generic.py

## Import Cycles
- None detected.

## Communities (58 total, 30 thin omitted)

### Community 0 - "match-status.ts"
Cohesion: 0.06
Nodes (80): GET(), querySchema, phaseFromEvent(), POST(), GET(), FormMatchRow, detectSport(), formatFemeninoLabel() (+72 more)

### Community 1 - "match-display.ts"
Cohesion: 0.05
Nodes (59): bodySchema, POST(), predictionSchema, AccumulatorBuilderPage(), MatchRow, SelectedMatch, Suggested, SuggestedAccumulatorsPage() (+51 more)

### Community 2 - "requireAuth()"
Cohesion: 0.06
Nodes (45): createSchema, GET(), POST(), GET(), GET(), GET(), PATCH(), patchSchema (+37 more)

### Community 3 - "route.ts"
Cohesion: 0.09
Nodes (52): cornersFromDiagnostics(), LegJson, loadTeamForm(), POST(), requireLlmKey(), schema, scoresFromPayload(), toCtx() (+44 more)

### Community 4 - "PageContainer.tsx"
Cohesion: 0.05
Nodes (16): loginType, registerType, PageContainer(), Props, ecoCard, Chart, products, Chart (+8 more)

### Community 5 - "generic.py"
Cohesion: 0.06
Nodes (35): ABC, ForebetScraper, Forebet multi-deporte: fútbol, basket, tenis, hockey, handball, vóley., BaseHtmlScraper, GenericTipsScraper, _guess_teams(), _is_meta_cell(), Any (+27 more)

### Community 6 - "base.py"
Cohesion: 0.06
Nodes (34): BeautifulSoup, empty_result(), exponential_retry(), fetch_html(), Any, random_delay(), random_ua(), Utilidades compartidas de scraping. (+26 more)

### Community 7 - "scripts"
Cohesion: 0.06
Nodes (35): jest, devDependencies, jest, ts-jest, tsx, @types/bcryptjs, @types/jest, @types/react (+27 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 9 - "server.js"
Cohesion: 0.13
Nodes (17): @prisma/client, @prisma/client, bootstrapDatabase(), { execSync }, path, ROOT, run(), seedIfNeeded() (+9 more)

### Community 10 - "MatchAnalysisDashboard.tsx"
Cohesion: 0.20
Nodes (14): GET(), Chart, MatchAnalysisDashboard(), TeamBadge(), verdictColor, exportNodeToPng(), flattenComputedColors(), monogramDataUrl() (+6 more)

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

### Community 15 - "dependencies"
Cohesion: 0.22
Nodes (9): @auth/prisma-adapter, html-to-image, lodash, @mui/icons-material, dependencies, @auth/prisma-adapter, html-to-image, lodash (+1 more)

### Community 16 - "main.py"
Cohesion: 0.28
Nodes (8): ingest(), main(), Any, Orquestador de scraping WPS Admin.  Ejecuta scrapers de 14 sitios y envía resu, Envía predicciones al endpoint de ingesta del backend.      Args:         bac, Ejecuta scrapers y publica resultados.      Args:         source_filter: slug, Punto de entrada CLI., run()

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

## Knowledge Gaps
- **196 isolated node(s):** `extends`, `next/core-web-vitals`, `nextConfig`, `name`, `version` (+191 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `scripts`, `server.js`, `react`, `apexcharts`, `bcryptjs`, `@emotion/cache`, `@emotion/react`, `@emotion/server`, `@emotion/styled`, `eslint`, `eslint-config-next`, `@mui/lab`, `@mui/material`, `@netlify/plugin-nextjs`, `next`, `next-auth`, `prisma`, `react-apexcharts`, `react-dom`, `react-mui-sidebar`, `react-syntax-highlighter`, `@tabler/icons-react`, `@types/lodash`, `@types/node`, `typescript`, `zod`?**
  _High betweenness centrality (0.188) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `dependencies`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **What connects `extends`, `next/core-web-vitals`, `nextConfig` to the rest of the system?**
  _196 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `match-status.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0602655771195097 - nodes in this community are weakly interconnected._
- **Should `match-display.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05485232067510549 - nodes in this community are weakly interconnected._
- **Should `requireAuth()` be split into smaller, more focused modules?**
  _Cohesion score 0.06153846153846154 - nodes in this community are weakly interconnected._
- **Should `route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08832425892316999 - nodes in this community are weakly interconnected._