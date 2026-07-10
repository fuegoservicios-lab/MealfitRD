# Frontend production-readiness v2 — diseño de ejecución

**Fecha:** 2026-07-09 · **Autor:** Claude (sesión autónoma, orden delegado por el owner)
**Petición:** "refactorizar el frontend completo, optimizarlo, velocidad y tenerlo al 100% listo para producción; encuentra todos los gaps posibles e implementalos en el orden que mejor consideres."

## Contexto

El roadmap de 39 items (artifact `c25c58d2`) ya tiene implementados los 11 P1 + P2-6 + P2-13 + P3-11 (commits `a040a2c…238bf62`, sin push). Este documento cubre la **fase 2**: los 13 P2 + 12 P3 restantes que sean alcanzables con seguridad, más gaps nuevos descubiertos por un segundo audit multi-agente (workflow `wf_b423988d`) enfocado en velocidad y producción.

## Baseline verificado (2026-07-09)

- Tests: 1344 pass / 6 fail — los 6 son pre-existentes del WIP del owner (Header.sticky_cta ×4, History.audit_hist_10, Settings), verificado idéntico al baseline de la sesión anterior.
- `tsc --noEmit`: limpio.
- ESLint: 638 errores → 575 son ruido de `ds-bundle/` (bundle generado sin ignorar); ~63 reales en `src/`.
- Build: pendiente de medir en el workflow (dimensión bundle-build).

## Decisiones de alcance

1. **Se implementa en olas por riesgo, no por número**: corrección primero (bugs latentes), velocidad después, estructura al final. Los splits XL (P3-5 Dashboard 7330 LOC, P3-6 AssessmentContext, P3-7 AgentPage, P3-8 Settings, P3-9 planData→TanStack) quedan **fuera de esta sesión** salvo que las olas anteriores terminen con margen: son cada uno un proyecto propio con gate de tests, y forzarlos en batch es el anti-patrón que el propio roadmap prohíbe ("nada de big-bang").
2. **Lint-zero como item nuevo** (no estaba en el roadmap): ignorar `ds-bundle/` en eslint, arreglar los ~63 errores reales de src/ (dead code en History/AgentPage/Dashboard, `useState(Date.now())` no-lazy en Plan, patrón matchMedia duplicado — que se resuelve junto con P2-14).
3. **WIP del owner**: los archivos con WIP sin commitear (Dashboard.jsx, Plan.jsx, InteractiveQuestions.jsx, index.html, main.jsx, index.css, ProtectedRoute.jsx, PendingPipelineRecovery.jsx) se tocan solo cuando el item lo exige; el commit hace fold del WIP con nota honesta (política documentada 2026-06-22).
4. **Sin push/deploy en esta sesión** salvo que el estado final sea verificablemente mejor que HEAD+WIP: hay 15 commits locales acumulados esperando decisión del owner; añadiré los míos a la cola y reportaré el estado exacto al final.
5. **Respeto de decisiones de producto**: i18n es-DO, zoom-lock, I6 (cero writes directos a meal_plans), console.error preservado.

## Olas

- **Ola A — corrección + quick wins:** P2-15 (bug latente disabledIngredients), P2-14 (useViewport SSOT — mata 4 copias del hook matchMedia y sus errores de lint), lint-zero, P3-10 (routing SSOT, dead links, 404 real).
- **Ola B — CSS/UX prod:** P2-7 (tokens --success/--info/--focus-ring/--space), P2-10 (Skeleton + PageLoader theme-aware), P2-8 (banner offline), P2-12 (a11y teclado History).
- **Ola C — server-state:** P2-1 (historyCaches/pantryCache → useQuery, −~520 LOC), P2-2 (polling → refetchInterval), P2-3 (query keys dedup).
- **Ola D — tests + splits seguros:** P2-9 (tests conductuales Auth/PaymentModal), P2-4 (split InteractiveQuestions), P2-5 (split History detail tabs), P2-11 (Pantry render helpers).
- **Ola E — larga cola alcanzable + gaps nuevos del workflow:** P3-4 (useLatestRef), P3-12 (EmptyState/retry/reload), P3-13 (wizard reducer), y los findings confirmados del audit v2 priorizados por severidad.

Cada ola termina con: suite completa verde (módulo 6 pre-existentes), typecheck, lint sin errores nuevos, commit scoped por pathspec.

## Estado de ejecución (actualizado durante la sesión)

- ✅ P2-14 useMediaQuery SSOT (`ca7950d`) · P2-15 disabledIngredients (`070b44c`) · P3-10 routing (`0e688c6`) · Speed-pack 11 fixes (`9d44f48`) · Lint-zero 638→0 (`7ba6551`) · P2-7/P2-10/P2-8 (`4ac23fa`).
- 🔄 En agentes: P2-12 + P2-7-History + labels + contraste · dead-code pack · P2-9 tests conductuales · P2-4 split InteractiveQuestions.
- ✅ P2-3 parcial: `window.__cachedQuota` → `utils/quotaCache.js` (fetchQuery keyed por usuario; Dashboard/Settings pendientes de integrar tras los agentes).
- ✅ P3-4 parcial: `useLatestRef` + migrados Modal/WaterTracker/AssessmentContext (AgentPage diferido a P3-7 — 6 mirrors con writes imperativos entrelazados).
- ⏸ Diferidos con razón (ver abajo): P2-1 full (historyCaches→useQuery: 7 test files anclan el singleton + History.jsx 4.8k LOC — proyecto propio green-to-green), P2-2 (polling→refetchInterval: 2 tests parser anclan literales `setInterval(...5000)`/3000 + PendingPipelineRecovery tiene WIP owner), P2-5/P2-11 splits (gate de tests propios primero), P3-5..P3-9 (XL por diseño del roadmap), P3-13 (API pública del wizard consumida por ~10 callsites — oportunista), P3-12 reload de Plan.jsx (máquina de estados local de recovery, WIP owner adyacente).

## Criterio de éxito

- 0 errores ESLint en src/ (gate confiable).
- Suite ≥ 1344 passing, 0 regresiones.
- Los 13 P2 restantes implementados o documentada la razón de deferral.
- Findings de velocidad del audit v2 de severidad high implementados.
- Reporte final con delta de bundle (build antes/después) y cola de commits lista para push/deploy del owner.
