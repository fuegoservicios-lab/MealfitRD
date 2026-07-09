// [P1-HIST-LIFETIME-LESSONS · 2026-05-09] Tests del surface lifetime
// del aprendizaje continuo en el modal del Historial.
//
// Bug original (audit Historial 2026-05-09 · gap P1-1):
//   El tab "Lecciones" del modal solo leía `chunk_lesson_telemetry`
//   (telemetría — señal SOBRE el aprendizaje). Las 3 estructuras
//   reales del aprendizaje (`_lifetime_lessons_summary`,
//   `_lifetime_lessons_history`, `_critical_lessons_permanent`) viven
//   en `meal_plans.plan_data` y eran invisibles para el usuario en
//   planes archivados.
//
// Fix:
//   Endpoint nuevo `/api/plans/{id}/lifetime-lessons` + sub-sección
//   "Aprendizaje del usuario" en el tab Lecciones (arriba de la
//   telemetría, divider entre ambas).
//
// Cobertura (static analysis del source):
//   - Anchor del marker.
//   - Wrapper getPlanLifetimeLessons en config/api.js.
//   - Helper _ensureLifetimeLessons + state lifetimeLessonsCache.
//   - Cache singleton (set/hydrate dedicado para objects).
//   - Sub-sección lifetime renderiza summary + critical + history.
//   - Sub-header divider entre lifetime y telemetría.
//   - Cleanup en visibilitychange (mismo patrón que los 4 caches
//     existentes — P0-HIST-CACHE-INVALIDATION).
//   - invalidateCachesForPlan también limpia lifetimeLessons.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    historyCaches,
    setCachedLifetimeEntry,
    hydrateLifetimeDict,
    invalidateCachesForPlan,
    _resetAllCachesForTests,
} from '../utils/historyCaches';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');
const _API_PATH = join(__dirname, '..', 'config', 'api.ts');
const _CACHES_PATH = join(__dirname, '..', 'utils', 'historyCaches.js');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const cssSrc = readFileSync(_CSS_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');
const cachesSrc = readFileSync(_CACHES_PATH, 'utf8');


describe('[P1-HIST-LIFETIME-LESSONS] anchor + wrapper api', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-LIFETIME-LESSONS\s*·\s*2026-05-09\]/);
    });

    it('marker presente en config/api.js', () => {
        expect(apiSrc).toMatch(/\[P1-HIST-LIFETIME-LESSONS\s*·\s*2026-05-09\]/);
    });

    it('marker presente en historyCaches.js', () => {
        expect(cachesSrc).toMatch(/\[P1-HIST-LIFETIME-LESSONS\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(cssSrc).toMatch(/\[P1-HIST-LIFETIME-LESSONS\s*·\s*2026-05-09\]/);
    });

    it('getPlanLifetimeLessons apunta al endpoint correcto', () => {
        expect(apiSrc).toMatch(
            /export\s+const\s+getPlanLifetimeLessons\s*=\s*\(\s*planId\s*\)\s*=>\s*fetchWithAuth\(\s*[`'"]\/api\/plans\/\$\{planId\}\/lifetime-lessons[`'"]\s*\)/
        );
    });

    it('History.jsx importa getPlanLifetimeLessons', () => {
        const importLine = src.match(
            /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/config\/api['"]/
        );
        expect(importLine).toBeTruthy();
        expect(importLine[0]).toMatch(/getPlanLifetimeLessons/);
    });
});


describe('[P1-HIST-LIFETIME-LESSONS] singleton cache helpers', () => {
    beforeEach(() => {
        _resetAllCachesForTests();
    });

    it('historyCaches expone lifetimeLessons Map', () => {
        expect(historyCaches.lifetimeLessons).toBeInstanceOf(Map);
    });

    it('setCachedLifetimeEntry persiste objects (no arrays)', () => {
        const planId = 'plan-x';
        const value = { summary: null, history: [], critical_permanent: [], counts: {} };
        setCachedLifetimeEntry(planId, value);
        expect(historyCaches.lifetimeLessons.get(planId)).toBeDefined();
        expect(historyCaches.lifetimeLessons.get(planId).value).toBe(value);
    });

    it('setCachedLifetimeEntry rechaza arrays (shape incorrecto)', () => {
        const planId = 'plan-bad-array';
        setCachedLifetimeEntry(planId, [1, 2, 3]);
        expect(historyCaches.lifetimeLessons.has(planId)).toBe(false);
    });

    it('setCachedLifetimeEntry rechaza primitivos / null', () => {
        setCachedLifetimeEntry('p1', null);
        setCachedLifetimeEntry('p2', 'string');
        setCachedLifetimeEntry('p3', 42);
        expect(historyCaches.lifetimeLessons.size).toBe(0);
    });

    it('hydrateLifetimeDict reconstruye dict desde el singleton', () => {
        setCachedLifetimeEntry('plan-a', { summary: { x: 1 } });
        setCachedLifetimeEntry('plan-b', { summary: null });
        const dict = hydrateLifetimeDict();
        expect(Object.keys(dict).sort()).toEqual(['plan-a', 'plan-b']);
        expect(dict['plan-a'].summary.x).toBe(1);
    });

    it('hydrateLifetimeDict purga entries expirados', () => {
        const planId = 'plan-expired';
        setCachedLifetimeEntry(planId, { summary: null }, /* ttlMs */ 1);
        // Esperar 5ms para que TTL expire.
        const start = Date.now();
        while (Date.now() - start < 5) { /* busy wait */ }
        const dict = hydrateLifetimeDict();
        expect(planId in dict).toBe(false);
        // Side-effect: el entry expirado debe haberse borrado del Map.
        expect(historyCaches.lifetimeLessons.has(planId)).toBe(false);
    });

    it('invalidateCachesForPlan también limpia lifetimeLessons', () => {
        const planId = 'plan-y';
        setCachedLifetimeEntry(planId, { summary: { x: 1 } });
        expect(historyCaches.lifetimeLessons.has(planId)).toBe(true);
        invalidateCachesForPlan(planId);
        expect(historyCaches.lifetimeLessons.has(planId)).toBe(false);
    });
});


describe('[P1-HIST-LIFETIME-LESSONS] state + helper en History.jsx', () => {
    it('useState lifetimeLessonsCache inicializado vía hydrateLifetimeDict', () => {
        expect(src).toMatch(
            /const\s*\[\s*lifetimeLessonsCache\s*,\s*setLifetimeLessonsCache\s*\]\s*=\s*useState\(/
        );
        // Lazy init desde el singleton (cross-mount persistence).
        expect(src).toMatch(/hydrateLifetimeDict\(\s*\)/);
    });

    it('helper _ensureLifetimeLessons usa sentinels loading/error', () => {
        const helperIdx = src.indexOf('_ensureLifetimeLessons');
        expect(helperIdx).toBeGreaterThan(-1);
        const block = src.slice(helperIdx, helperIdx + 6000);
        expect(block).toMatch(/setLifetimeLessonsCache\([\s\S]*?['"]loading['"]/);
        expect(block).toMatch(/setLifetimeLessonsCache\([\s\S]*?['"]error['"]/);
    });

    it('_ensureLifetimeLessons distingue object cargado de sentinels', () => {
        // El check `current && typeof current === 'object'
        // && !Array.isArray(current)` es lo que hace shortcircuit
        // sin re-fetch cuando ya hay payload.
        const helperIdx = src.indexOf('_ensureLifetimeLessons');
        const block = src.slice(helperIdx, helperIdx + 6000);
        expect(block).toMatch(/typeof\s+current\s*===\s*['"]object['"]/);
        expect(block).toMatch(/!Array\.isArray\(current\)/);
    });

    it('_ensureLifetimeLessons normaliza el payload con defaults seguros', () => {
        // Payload defectuoso (e.g. summary string) NO debe romper render —
        // cada sub-key cae al default.
        const helperIdx = src.indexOf('_ensureLifetimeLessons');
        const block = src.slice(helperIdx, helperIdx + 6000);
        expect(block).toMatch(/normalized\s*=/);
        // 4 keys del shape esperado.
        expect(block).toMatch(/summary:/);
        expect(block).toMatch(/history:/);
        expect(block).toMatch(/critical_permanent:/);
        expect(block).toMatch(/counts:/);
    });

    it('_ensureLifetimeLessons persiste en singleton tras éxito', () => {
        const helperIdx = src.indexOf('_ensureLifetimeLessons');
        const block = src.slice(helperIdx, helperIdx + 6000);
        expect(block).toMatch(/setCachedLifetimeEntry\s*\(\s*planId\s*,\s*normalized\s*\)/);
    });
});


describe('[P1-HIST-LIFETIME-LESSONS] tab Lecciones dispara ambos endpoints', () => {
    it('botón del tab "Lecciones" llama a _ensureLessonsDetail Y _ensureLifetimeLessons', () => {
        // El onClick del tab debe disparar AMBOS lazy fetches en
        // paralelo (telemetría + lifetime). El anchor
        // `setActiveModalTab('lessons');` (con punto y coma) aparece
        // SOLO en el onClick del botón — el guard JSX usa la
        // comparación `activeModalTab === 'lessons'` (sin call).
        const tabIdx = src.indexOf("setActiveModalTab('lessons');");
        expect(tabIdx).toBeGreaterThan(-1);
        const block = src.slice(tabIdx, tabIdx + 1500);
        expect(block).toMatch(/_ensureLessonsDetail\(selectedPlan\.id\)/);
        expect(block).toMatch(/_ensureLifetimeLessons\(selectedPlan\.id\)/);
    });
});


describe('[P1-HIST-LIFETIME-LESSONS] render del sub-bloque lifetime', () => {
    it('header "Aprendizaje del usuario" presente', () => {
        expect(src).toMatch(/Aprendizaje del usuario/);
    });

    it('proxy badge se renderiza cuando _lifetime_proxy_ratio >= 0.5', () => {
        // [P1-HIST-LIFETIME-LESSONS] Anchor migrado a `_proxyDegraded`
        // — string único del bloque (los 2 matches de `lifetimeLessonsHeader`
        // incluyen el className de criticalBlock que confunde el slice).
        const anchorIdx = src.indexOf('_proxyDegraded');
        expect(anchorIdx).toBeGreaterThan(-1);
        const block = src.slice(anchorIdx, anchorIdx + 4000);
        expect(block).toMatch(/_proxyRatio\s*>=\s*0\.5/);
        expect(block).toMatch(/lifetimeProxyBadge/);
        expect(block).toMatch(/Proxy\s*\{/);
    });

    it('counters render: rechazos + alergias + logs + proxy', () => {
        // Anchor: `lifetimeCountersRow` es la clase del bloque que
        // envuelve los 4 counters — única y posterior al comentario
        // que tiene el texto "Aprendizaje del usuario".
        const anchorIdx = src.indexOf('lifetimeCountersRow');
        expect(anchorIdx).toBeGreaterThan(-1);
        const block = src.slice(anchorIdx, anchorIdx + 4000);
        expect(block).toMatch(/Rechazos:\s*\{_rej\}/);
        expect(block).toMatch(/Alergias:\s*\{_alg\}/);
        expect(block).toMatch(/Logs:\s*\{_logs\}/);
        expect(block).toMatch(/Proxy:\s*\{_proxy\}/);
    });

    it('listas top: blocklist + rechazos + repetidos + bases', () => {
        // Anchor: `_renderList` helper local del bloque — único.
        const anchorIdx = src.indexOf('_renderList');
        expect(anchorIdx).toBeGreaterThan(-1);
        const block = src.slice(anchorIdx, anchorIdx + 4000);
        expect(block).toMatch(/permanent_meal_blocklist/);
        expect(block).toMatch(/top_rejection_hits/);
        expect(block).toMatch(/top_repeated_meal_names/);
        expect(block).toMatch(/top_repeated_bases/);
        // Render label.
        expect(block).toMatch(/Blocklist permanente/);
        expect(block).toMatch(/Top rechazos/);
        expect(block).toMatch(/Meals repetidos/);
        expect(block).toMatch(/Bases repetidas/);
    });

    it('cap visual de 10 items por lista + "+N más"', () => {
        const anchorIdx = src.indexOf('_renderList');
        const block = src.slice(anchorIdx, anchorIdx + 2000);
        expect(block).toMatch(/_shown\s*=\s*items\.slice\(0,\s*10\)/);
        expect(block).toMatch(/lifetimeListItemMore/);
    });

    it('sub-bloque "Lecciones permanentes" itera critical_permanent (cap 8)', () => {
        const blockIdx = src.indexOf('Lecciones permanentes');
        expect(blockIdx).toBeGreaterThan(-1);
        const block = src.slice(blockIdx, blockIdx + 3500);
        expect(block).toMatch(/_critical\.slice\(0,\s*8\)/);
        // Badge "Alergia" / "Rechazo crítico" según el shape.
        expect(block).toMatch(/Alergia|Rechazo cr[ií]tico/);
    });

    it('sub-bloque "Historial reciente por chunk" muestra top 5 (collapsed)', () => {
        // [P2-HIST-NEW-5 · 2026-05-09] El cap pasó de literal 5 a
        // constante `_COLLAPSED_CAP = 5` con toggle expand/collapse.
        // El slice ahora vive en el IIFE preamble (antes del texto
        // JSX "Historial reciente..."). Anchoreamos al comentario
        // único del IIFE — `Slice dinámico según expansión` aparece
        // solo una vez en todo el archivo.
        const anchorIdx = src.indexOf('Slice dinámico según expansión');
        expect(anchorIdx).toBeGreaterThan(-1);
        // Slice amplio para cubrir desde el IIFE comment hasta el
        // <ul> del map de entries.
        const block = src.slice(anchorIdx, anchorIdx + 4000);
        // Slice usa _COLLAPSED_CAP O literal 5 (compat cross-version).
        expect(block).toMatch(
            /_history\.slice\(\s*0\s*,\s*(?:5|_COLLAPSED_CAP)\s*\)/
        );
        expect(block).toMatch(/entry\.chunk/);
        // Y el header del bloque debe estar en el slice también
        // (el IIFE comment + el cómputo + la JSX que renderiza).
        expect(block).toMatch(/Historial reciente por chunk/);
    });

    it('sub-bloque omite render si no hay contenido (_hasContent=false)', () => {
        // Plan legacy sin las keys → endpoint devuelve summary=null +
        // arrays vacíos → sub-sección oculta para no agregar ruido.
        // Anchor en `_hasContent` directo; aparece exactamente en el
        // bloque que define la condición y el guard.
        const anchorIdx = src.indexOf('_hasContent');
        expect(anchorIdx).toBeGreaterThan(-1);
        const block = src.slice(anchorIdx, anchorIdx + 600);
        expect(block).toMatch(/_hasContent\s*=/);
        expect(block).toMatch(/if\s*\(\s*!_hasContent\s*\)\s*return\s+null/);
    });

    it('estados loading / error muestran mensajes específicos', () => {
        const headerIdx = src.indexOf('_ll = lifetimeLessonsCache');
        expect(headerIdx).toBeGreaterThan(-1);
        const block = src.slice(headerIdx, headerIdx + 2000);
        expect(block).toMatch(/Cargando aprendizaje/);
        expect(block).toMatch(/No se pudo cargar el aprendizaje agregado/);
    });
});


describe('[P1-HIST-LIFETIME-LESSONS] divider entre lifetime y telemetría', () => {
    it('divider "Eventos de telemetría" condicionado a _hasLifetime', () => {
        // Si la lifetime cayó a oculta (sin contenido), el divider
        // sería confuso — solo render cuando AMBAS secciones existen.
        const dividerIdx = src.indexOf('Eventos de telemetría');
        expect(dividerIdx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, dividerIdx - 1500), dividerIdx + 200);
        expect(block).toMatch(/_hasLifetime\s*=/);
        expect(block).toMatch(/lifetimeSectionDivider/);
    });
});


describe('[P1-HIST-LIFETIME-LESSONS] cleanup en visibilitychange', () => {
    it('listener de visibility limpia setLifetimeLessonsCache también', () => {
        // Cuando el usuario vuelve al tab tras >60s, el listener
        // limpia los 5 caches del plan abierto. Sin esto, el cache
        // del lifetime quedaría stale aunque el resto se refresque.
        const useEffectIdx = src.indexOf('_onVisibilityChange');
        expect(useEffectIdx).toBeGreaterThan(-1);
        // [P1-VITEST-DEBT · 2026-06-25] Ventana ampliada 3500→6000: el cuerpo del
        // listener creció (refresh del listado + reconciliación) y el clear de
        // setLifetimeLessonsCache (limpieza del 5º cache, ~línea 627) quedó pasado
        // el corte. Sigue dentro del listener; el próximo setLifetimeLessonsCache
        // está ~9k chars más allá (en _ensureLifetimeLessons) → sin falso match.
        const block = src.slice(useEffectIdx, useEffectIdx + 6000);
        expect(block).toMatch(/setLifetimeLessonsCache/);
    });
});


describe('[P1-HIST-LIFETIME-LESSONS] CSS del bloque lifetime', () => {
    it('clase .lifetimeLessonsBlock definida', () => {
        expect(cssSrc).toMatch(/\.lifetimeLessonsBlock\s*\{/);
    });

    it('paleta indigo (no rojo/amber del status)', () => {
        // Indigo sutil — palette positiva ("lo que el sistema aprendió")
        // distinta a la severity de status (red/amber).
        const blockMatch = cssSrc.match(/\.lifetimeLessonsBlock\s*\{[\s\S]*?\}/);
        expect(blockMatch).toBeTruthy();
        // Background indigo-50/violet-50 gradient + border indigo-200.
        expect(blockMatch[0]).toMatch(/#EEF2FF|#F5F3FF/);
        expect(blockMatch[0]).toMatch(/#C7D2FE/);
    });

    it('clases auxiliares definidas: header / counters / list / critical / history / divider', () => {
        const required = [
            'lifetimeLessonsHeader',
            'lifetimeProxyBadge',
            'lifetimeCountersRow',
            'lifetimeListBlock',
            'lifetimeListLabel',
            'lifetimeListItem',
            'lifetimeListItemMore',
            'lifetimeCriticalBlock',
            'lifetimeHistoryBlock',
            'lifetimeCriticalHeader',
            'lifetimeCriticalCount',
            'lifetimeSectionDivider',
        ];
        for (const cls of required) {
            // Selector puede ser simple (`.cls {`) o compuesto
            // (`.cls,\n.other {`). Aceptamos ambos formatos.
            expect(cssSrc).toMatch(new RegExp(`\\.${cls}\\s*[\\{,]`));
        }
    });
});
