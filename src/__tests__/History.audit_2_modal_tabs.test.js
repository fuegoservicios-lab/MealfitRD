// [P2-HIST-AUDIT-2 · 2026-05-09] Tests del modal del Historial con
// tabs Menú / Lecciones / Ajustes + lazy fetch del detalle.
//
// Bug original (audit historial 2026-05-08):
//   Los chips agregados de la card ("X lecciones", "X ajustes") eran
//   dead-end: el usuario veía el conteo pero no podía expandir a ver
//   QUÉ aprendió o QUÉ ajustes hizo. Surface del diferenciador
//   ("aprendizaje continuo") quedaba invisible.
//
// Fix:
//   Modal con sistema de tabs (Menú/Lecciones/Ajustes). Tabs
//   Lecciones/Ajustes solo aparecen si el plan tiene contenido
//   correspondiente (>0). Lazy fetch al click — no carga si no se
//   abre. Cache per-plan_id evita re-fetch.
//
// Cobertura (static analysis del source):
//   - Anchor del marker.
//   - Imports de los nuevos helpers (getPlanLessonsDetail,
//     getPlanCoherenceHistory).
//   - State `activeModalTab`, `lessonsDetailCache`,
//     `coherenceHistoryCache` declarados.
//   - Reset a 'menu' en onClick del card.
//   - Helpers `_ensureLessonsDetail` / `_ensureCoherenceHistory`
//     hacen lazy fetch con sentinels loading/error y cache hit
//     check.
//   - JSX: tabs nav condicional (solo si _hasLessons o _hasAdjusts).
//   - JSX: tab "Lecciones" maneja loading/error/empty/list.
//   - JSX: tab "Ajustes" idem.
//   - Helpers api.js definidos.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _API_PATH = join(__dirname, '..', 'config', 'api.js');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');
const cssSrc = readFileSync(_CSS_PATH, 'utf8');


describe('[P2-HIST-AUDIT-2] anchor + helpers api.js', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-2\s*·\s*2026-05-09\]/);
    });

    it('helper getPlanLessonsDetail definido en config/api.js', () => {
        expect(apiSrc).toMatch(/export\s+const\s+getPlanLessonsDetail\s*=/);
        // Path con template literal (backticks).
        expect(apiSrc).toMatch(/`\/api\/plans\/\$\{planId\}\/lessons`/);
    });

    it('helper getPlanCoherenceHistory definido en config/api.js', () => {
        expect(apiSrc).toMatch(/export\s+const\s+getPlanCoherenceHistory\s*=/);
        expect(apiSrc).toMatch(/`\/api\/plans\/\$\{planId\}\/coherence-history`/);
    });

    it('History.jsx importa los dos helpers nuevos', () => {
        expect(src).toMatch(/import\s*\{[^}]*getPlanLessonsDetail[^}]*\}\s*from\s*['"]\.\.\/config\/api['"]/);
        expect(src).toMatch(/import\s*\{[^}]*getPlanCoherenceHistory[^}]*\}\s*from\s*['"]\.\.\/config\/api['"]/);
    });
});


describe('[P2-HIST-AUDIT-2] state local del modal', () => {
    it('useState para activeModalTab con default "menu"', () => {
        expect(src).toMatch(/useState\(\s*['"]menu['"]\s*\)/);
        expect(src).toMatch(/setActiveModalTab/);
    });

    it('useState para lessonsDetailCache y coherenceHistoryCache', () => {
        expect(src).toMatch(/setLessonsDetailCache/);
        expect(src).toMatch(/setCoherenceHistoryCache/);
    });

    it('reset a "menu" en onClick del card', () => {
        // El reset debe ocurrir junto al setSelectedDay/setActiveChunkIdx
        // — antes del lazy load del plan_data.
        // [P2-HIST-MODALS-A11Y · 2026-05-30] Anchor actualizado a `() => {`:
        // P3-HIST-FAST-OPEN (2026-05-18) refactoró el onClick del card de
        // `async () => { await ... }` a síncrono `() => { ...then() }`
        // (optimistic open), dejando el anchor `async` stale → este test
        // fallaba en baseline. El primer `onClick={() => {` del archivo es
        // el del card (los siguientes son botones de tab dentro del modal).
        const onClickIdx = src.indexOf('onClick={() => {');
        expect(onClickIdx).toBeGreaterThan(-1);
        const block = src.slice(onClickIdx, onClickIdx + 2500);
        expect(block).toMatch(/setActiveModalTab\s*\(\s*['"]menu['"]\s*\)/);
    });
});


describe('[P2-HIST-AUDIT-2] lazy fetch helpers', () => {
    it('_ensureLessonsDetail definido como async + usa cache hit check', () => {
        expect(src).toMatch(/const\s+_ensureLessonsDetail\s*=\s*async/);
        const idx = src.indexOf('const _ensureLessonsDetail');
        const block = src.slice(idx, idx + 1500);
        // Cache hit early return.
        expect(block).toMatch(/lessonsDetailCache\[planId\]/);
        expect(block).toMatch(/Array\.isArray\(current\)/);
        expect(block).toMatch(/['"]loading['"]/);
        // Llama al endpoint.
        expect(block).toMatch(/getPlanLessonsDetail\(planId\)/);
        // Sentinel error en catch.
        expect(block).toMatch(/['"]error['"]/);
    });

    it('_ensureCoherenceHistory definido como async + usa cache hit check', () => {
        expect(src).toMatch(/const\s+_ensureCoherenceHistory\s*=\s*async/);
        const idx = src.indexOf('const _ensureCoherenceHistory');
        const block = src.slice(idx, idx + 1500);
        expect(block).toMatch(/coherenceHistoryCache\[planId\]/);
        expect(block).toMatch(/getPlanCoherenceHistory\(planId\)/);
        expect(block).toMatch(/['"]error['"]/);
    });
});


describe('[P2-HIST-AUDIT-2] tabs nav JSX', () => {
    it('modalTabs nav condicional sólo si hasLessons o hasAdjusts', () => {
        // El bloque del tabs nav debe estar dentro del modal y
        // condicionado: si NO hay nada extra, no se renderiza.
        // [P2-HIST-AUDIT-10 · 2026-05-09] Slice ampliado para
        // acomodar la lógica añadida (_completedCount + _hasMetrics).
        // El guard original `!_hasLessons && !_hasAdjusts` fue
        // extendido a `!_hasLessons && !_hasAdjusts && !_hasMetrics`.
        const tabsIdx = src.indexOf('styles.modalTabs');
        expect(tabsIdx).toBeGreaterThan(-1);
        const around = src.slice(Math.max(0, tabsIdx - 2200), tabsIdx + 100);
        expect(around).toMatch(/_hasLessons/);
        expect(around).toMatch(/_hasAdjusts/);
        // Guard ahora con 3 flags. Verificamos prefix-only para no
        // romper si en el futuro se añade un 4º tab.
        expect(around).toMatch(
            /if\s*\(\s*!_hasLessons\s*&&\s*!_hasAdjusts\s*&&\s*!_hasMetrics\s*\)\s*return\s+null/
        );
    });

    it('botón "Menú" siempre visible cuando los tabs aparecen', () => {
        const tabsIdx = src.indexOf('styles.modalTabs');
        const around = src.slice(tabsIdx, tabsIdx + 3000);
        expect(around).toMatch(/onClick=\{\(\)\s*=>\s*setActiveModalTab\(['"]menu['"]\)\}/);
        expect(around).toMatch(/>\s*Menú\s*</);
    });

    it('botón "Lecciones" condicional + dispara _ensureLessonsDetail', () => {
        const tabsIdx = src.indexOf('styles.modalTabs');
        const around = src.slice(tabsIdx, tabsIdx + 3000);
        expect(around).toMatch(/_hasLessons\s*&&/);
        expect(around).toMatch(/_ensureLessonsDetail\(selectedPlan\.id\)/);
        expect(around).toMatch(/>\s*Lecciones\s*\(\{_lessonsCount\}\)\s*</);
    });

    it('botón "Ajustes" condicional + dispara _ensureCoherenceHistory', () => {
        const tabsIdx = src.indexOf('styles.modalTabs');
        const around = src.slice(tabsIdx, tabsIdx + 3000);
        expect(around).toMatch(/_hasAdjusts\s*&&/);
        expect(around).toMatch(/_ensureCoherenceHistory\(selectedPlan\.id\)/);
        expect(around).toMatch(/>\s*Ajustes\s*\(\{_adjustsCount\}\)\s*</);
    });
});


describe('[P2-HIST-AUDIT-2] contenido condicional según activeModalTab', () => {
    it('tab "Lecciones" maneja loading / error / empty / list', () => {
        // [P1-HIST-LIFETIME-LESSONS · 2026-05-09] El tab "Lecciones"
        // ahora tiene DOS bloques con guard `activeModalTab ===
        // 'lessons' && (()`:
        //   1. Sub-sección "Aprendizaje del usuario" (lifetime).
        //   2. Telemetría (chunk_lesson_telemetry — original).
        // Esta aserción testea el render de la TELEMETRÍA — usamos
        // matchAll y tomamos la segunda ocurrencia.
        const _allMatches = [...src.matchAll(/activeModalTab === 'lessons' && \(\(\)/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const tabIdx = _allMatches[1].index;
        expect(tabIdx).toBeGreaterThan(-1);
        // Slice ampliado a 5500 — el bloque ahora incluye el divider
        // IIFE de [P1-HIST-LIFETIME-LESSONS] que empuja styles.detailList
        // más abajo en el source.
        const block = src.slice(tabIdx, tabIdx + 5500);
        expect(block).toMatch(/Cargando lecciones/i);
        expect(block).toMatch(/No se pudo cargar/i);
        expect(block).toMatch(/no tiene lecciones/i);
        expect(block).toMatch(/styles\.detailList/);
        expect(block).toMatch(/lesson\.event/);
        expect(block).toMatch(/lesson\.synthesized_count/);
    });

    it('tab "Ajustes" maneja loading / error / empty / list ordenada', () => {
        const tabIdx = src.indexOf("activeModalTab === 'adjustments' && (()");
        expect(tabIdx).toBeGreaterThan(-1);
        const block = src.slice(tabIdx, tabIdx + 3500);
        expect(block).toMatch(/Cargando ajustes/i);
        expect(block).toMatch(/No se pudo cargar/i);
        expect(block).toMatch(/no tiene ajustes/i);
        expect(block).toMatch(/entry\.action_taken/);
        // Reverse para mostrar más recientes primero.
        expect(block).toMatch(/\.reverse\(\)/);
    });

    it('tab "Menú" wrapper preserva contenido legacy bajo condicional', () => {
        // El bloque tradicional (day tabs + menu list) debe estar
        // condicionado a activeModalTab === 'menu' — sin esto, el
        // menu se mostraría siempre, incluso al cambiar a otro tab.
        expect(src).toMatch(/activeModalTab\s*===\s*['"]menu['"]\s*&&/);
    });
});


describe('[P2-HIST-AUDIT-2] CSS de tabs y detail list', () => {
    it('styles.modalTabs y modalTab/modalTabActive definidos', () => {
        expect(cssSrc).toMatch(/\.modalTabs\s*\{/);
        expect(cssSrc).toMatch(/\.modalTab\s*\{/);
        expect(cssSrc).toMatch(/\.modalTabActive\s*\{/);
    });

    it('styles.detailList + detailItem + detailItemBadge definidos', () => {
        expect(cssSrc).toMatch(/\.detailList\s*\{/);
        expect(cssSrc).toMatch(/\.detailItem\s*\{/);
        expect(cssSrc).toMatch(/\.detailItemBadge\s*\{/);
    });

    it('styles.modalDetailEmpty para estado vacío/loading/error', () => {
        expect(cssSrc).toMatch(/\.modalDetailEmpty\s*\{/);
    });
});
