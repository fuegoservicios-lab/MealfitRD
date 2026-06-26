// [P2-HIST-AUDIT-8 · 2026-05-09] Tests del bloque "días pendientes"
// en el modal del Historial.
//
// Bug original (audit Historial 2026-05-09):
//   El modal solo listaba los días generados — un plan con
//   daysGenerated=2/totalDaysRequested=6 mostraba 2 días y el
//   chip "Parcial 2/6" fuera del modal era el único indicio de
//   los 4 días invisibles.
//
// Fix:
//   Bloque informativo al final del menú cuando hay gap, con
//   reason inferida según los counters del queue (P0-AUDIT-HIST-2,
//   P1-AUDIT-HIST-4 embedded counters):
//     - recovery_exhausted_count > 0 → tone Bad ("regenerar plan")
//     - chunk_pending_user_action_count > 0 → tone Warn ("esperando acción")
//     - chunk_failed_count > 0 → tone Bad
//     - chunk_in_flight_count > 0 → tone Info ("en proceso")
//     - fallback → tone Info ("aún no se han generado")
//
// Cobertura:
//   1. Anchor del marker.
//   2. Render condicional: solo cuando hay gap real
//      (daysGenerated < totalRequested O exhausted > 0).
//   3. Range string: "Día N" singular, "Días N–M" plural.
//   4. Cascada de reasons por prioridad (recovery_exhausted >
//      pending_user_action > failed > in_flight > fallback).
//   5. Mapeo tone → CSS class (info/warn/bad).
//   6. Lectura de counters embedded prefer summary fallback
//      (mismo patrón que getStatusInfo).
//   7. CSS classes definidas en History.module.css.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const cssSrc = readFileSync(_CSS_PATH, 'utf8');


describe('[P2-HIST-AUDIT-8] anchor + estructura del bloque', () => {
    it('marker presente en History.jsx', () => {
        // [actualizado] El bloque "días pendientes" se desactivó (UX
        // 2026-05-19) envolviéndolo en `{false && (...)}` y su marker pasó
        // de [P2-HIST-AUDIT-8] a [P3-HIST-MISSING-DAYS-REMOVED]. El IIFE
        // se preserva como dead code revivible; este guard sigue anclando
        // su estructura via el marker actual.
        expect(src).toMatch(/\[P3-HIST-MISSING-DAYS-REMOVED\s*·\s*2026-05-19\]/);
    });

    it('renderiza missingDaysBlock con header + reason', () => {
        // Verificamos que las className clave del bloque existen
        // en el render JSX.
        expect(src).toMatch(/styles\.missingDaysBlock/);
        expect(src).toMatch(/styles\.missingDaysHeader/);
        expect(src).toMatch(/styles\.missingDaysReason/);
        expect(src).toMatch(/styles\.missingDaysCount/);
    });
});


describe('[P2-HIST-AUDIT-8] guard de render (gap real)', () => {
    it('omite render cuando no hay gap (missingDays=0 AND exhausted=0)', () => {
        // Buscar el if/return null que cierra el helper cuando
        // no hay gap. Debe checar AMBOS: missingDays === 0 Y
        // _exhaustedCount === 0.
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        expect(blockIdx).toBeGreaterThan(-1);
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(
            /_missingDays\s*===\s*0\s*&&\s*_exhaustedCount\s*===\s*0[^?]*return\s+null/
        );
    });

    it('lee total_days_requested top-level (P1-HIST-AUDIT-4 summary)', () => {
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(/_plan\.total_days_requested/);
    });

    it('fallback a plan_data.total_days_requested (legacy)', () => {
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(/_plan\.plan_data\?\.total_days_requested/);
    });
});


describe('[P2-HIST-AUDIT-8] range string singular/plural', () => {
    it('singular: "el día N" cuando missingDays === 1', () => {
        // [P0-HIST-FIX-2 · 2026-05-09] Copy clarificado: antes el
        // range plural era "Días N–M" con en-dash que se leía
        // ambiguo junto al chip "4/6". Nuevo formato natural:
        // "el día N" / "del día N al día M".
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(
            /_missingDays\s*===\s*1[^]*?el\s+d[ií]a\s*\$\{[^}]+\}/
        );
    });

    it('plural: "del día N al día M" cuando missingDays > 1', () => {
        // [P0-HIST-FIX-2 · 2026-05-09] Reemplaza "Días N–M" (en-dash
        // ambiguo) por la frase explícita.
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(
            /_missingDays\s*>\s*1[^]*?del\s+d[ií]a\s*\$\{[^}]+\}\s*al\s+d[ií]a\s*\$\{/
        );
    });
});


describe('[P2-HIST-AUDIT-8] prioridad de reasons', () => {
    it('exhaustedCount > 0 → reason "Reactivar este Plan" + tone Bad', () => {
        // [P0-HIST-FIX-2 · 2026-05-09] Copy re-escrito apuntando al
        // botón concreto del modal ("Reactivar este Plan") en lugar
        // del verbo abstracto "regenerar".
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        // [actualizado · P3-HIST-ACTIVE-NO-REACTIVATE] El copy "Reactivar
        // este Plan" se extrajo a la variable _ctaRetryWithInfo; el branch
        // exhausted la interpola en _reason y setea tone 'bad'.
        expect(block).toMatch(
            /if\s*\(_exhaustedCount\s*>\s*0\)\s*\{[\s\S]*?_reason\s*=[\s\S]*?_ctaRetryWithInfo[\s\S]*?_tone\s*=\s*['"]bad['"]/i
        );
        // El copy concreto sigue presente, ahora en la def de _ctaRetryWithInfo.
        expect(block).toMatch(/_ctaRetryWithInfo\s*=[\s\S]*?Reactivar este Plan/);
    });

    it('pending_user_action > 0 → tone Warn (esperando actualización)', () => {
        // [P0-HIST-FIX-2 · 2026-05-09] Copy explica QUÉ se espera
        // (nevera/registro/fecha) en vez del genérico "esperando acción".
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(
            /_puac\s*>\s*0[^]*?_tone\s*=\s*['"]warn['"]/
        );
        expect(block).toMatch(/esperando que actualices/i);
    });

    it('failed > 0 (sin pending_user_action) → tone Bad', () => {
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(
            /_failedC\s*>\s*0[^]*?_tone\s*=\s*['"]bad['"]/
        );
    });

    it('in_flight > 0 → tone Info con copy de tiempo concreto', () => {
        // [P0-HIST-FIX-2 · 2026-05-09] Copy nuevo: "en segundo plano.
        // Cierra el modal y vuelve a abrirlo en 2 a 5 minutos".
        // Antes "Generación en proceso — vuelve a abrir el plan en
        // unos minutos" era poco accionable (¿cuánto tiempo?).
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(
            /_inFlight\s*>\s*0[^]*?_tone\s*=\s*['"]info['"]/
        );
        expect(block).toMatch(/en segundo plano/i);
        // El rango "2 a 5 minutos" es información concreta vs
        // "unos minutos" indefinido.
        expect(block).toMatch(/2\s*a\s*5\s*minutos/i);
    });

    it('fallback general (else) usa tone Info', () => {
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        // [P0-HIST-FIX-2 · 2026-05-09] El else ahora asigna también
        // _icon (📅) además de _reason y _tone.
        expect(block).toMatch(
            /\}\s*else\s*\{[\s\S]*?_reason\s*=[\s\S]*?_tone\s*=\s*['"]info['"]/
        );
    });
});


describe('[P2-HIST-AUDIT-8] mapeo tone → CSS class', () => {
    it('tone "bad" mapea a styles.missingDaysBad', () => {
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(
            /_tone\s*===\s*['"]bad['"][^?]*\?\s*styles\.missingDaysBad/
        );
    });

    it('tone "warn" mapea a styles.missingDaysWarn', () => {
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(
            /_tone\s*===\s*['"]warn['"][^?]*\?\s*styles\.missingDaysWarn/
        );
    });

    it('tone fallback mapea a styles.missingDaysInfo', () => {
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(/styles\.missingDaysInfo/);
    });
});


describe('[P2-HIST-AUDIT-8] precedencia counters (embedded > summary fallback)', () => {
    it('lee chunk_pending_user_action_count embedded primero', () => {
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        // typeof check defensivo — coherente con getStatusInfo
        // (P1-AUDIT-HIST-4).
        expect(block).toMatch(
            /typeof\s+_plan\.chunk_pending_user_action_count\s*===\s*['"]number['"]/
        );
    });

    it('fallback a summary cuando embedded ausente', () => {
        const blockIdx = src.indexOf('P3-HIST-MISSING-DAYS-REMOVED');
        const block = src.slice(blockIdx, blockIdx + 23000);
        expect(block).toMatch(/_summaryEntry/);
        expect(block).toMatch(/chunkStatusSummary\[_plan\.id\]/);
    });
});


describe('[P0-HIST-FIX-2] counter unambiguo "X de Y listos"', () => {
    // El bug que motivó el fix: chip "4/6" leído ambiguamente —
    // ¿4 hechos o 4 faltan? Reframe a "2 de 6 listos" lo hace
    // progreso explícito (X done de Y total).
    it('counter usa "X de _displayTotal listos" (X = _generatedTotal)', () => {
        // [P0-HIST-FIX-3 · 2026-05-09] El total usa `_displayTotal`
        // (plan original).
        // [P0-HIST-FIX-4 · 2026-05-09] El numerador usa `_generatedTotal`
        // = _planDaysLen + _expiredDays — el primer chunk genera 3
        // días (Vie+Sáb+Dom). Aunque Vie ya expiró visualmente,
        // FUE generado y debe contar. Antes se mostraba "2 de 7"
        // (planDaysLen sin expirados), causando mismatch con el
        // mental model del usuario que dijo "el primer chunk
        // genera 3 días no 2".
        const idx = src.lastIndexOf('P0-HIST-FIX-2');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(
            /\{_generatedTotal\}\s*de\s*\{_displayTotal\}\s*listos/
        );
        // Anti-pattern: el chip viejo `{_missingDays}/{_totalRequested}`
        // NO debe regresar.
        expect(block).not.toMatch(/\{_missingDays\}\/\{_totalRequested\}/);
        // Anti-pattern: usar `_planDaysLen` directamente (sin sumar
        // expirados) tampoco — ese era el bug intermedio P0-HIST-FIX-3.
        expect(block).not.toMatch(
            /\{_planDaysLen\}\s*de\s*\{_displayTotal\}\s*listos/
        );
    });

    it('counter tiene tooltip con detalle (incluye plan original + por generar)', () => {
        // [P0-HIST-FIX-3] Tooltip explica los 4 estados del cómputo:
        // generados disponibles, por generar, ya pasaron (cuando aplica),
        // plan original. El template literal tiene backticks anidados
        // (template-in-template para el branch de _expiredDays), así
        // que `[^`]*` no funciona — usamos lazy any-char [\s\S]*?.
        const idx = src.lastIndexOf('P0-HIST-FIX-2');
        const block = src.slice(idx, idx + 6000);
        // El title= debe arrancar template literal y contener "por
        // generar" + "plan original:" en algún punto antes del cierre.
        expect(block).toMatch(/title=\{`[\s\S]*?por generar/);
        expect(block).toMatch(/title=\{`[\s\S]*?plan original:/);
    });

    it('título header dice "Faltan N días por generar" (singular/plural)', () => {
        // Header explícito: "Faltan 4 días por generar" / "Falta 1
        // día por generar" — el número va en el título, no en chip
        // ambiguo.
        // Anchor en LAST occurrence (más cerca del render JSX) —
        // el marker aparece varias veces en el bloque (range, reason,
        // counter). El último corresponde al return del IIFE.
        const idx = src.lastIndexOf('P0-HIST-FIX-2');
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(/Falta\s+1\s+d[ií]a\s+por\s+generar/);
        expect(block).toMatch(/Faltan\s+\$\{_missingDays\}\s+d[ií]as\s+por\s+generar/);
    });
});


describe('[P0-HIST-FIX-3] expired days handling (mismatch active vs original)', () => {
    // Caso prod: plan creado como 7 días, shift_plan trimmeó a 6,
    // plan_data.days actual = 2 (Sábado, Domingo). User espera ver:
    //   - Chip: "2 de 7 listos" (NO "2 de 6")
    //   - Subtitle con mención del día expirado.
    it('declara _displayTotal = max(_activeTotal, _legacyTotalDays)', () => {
        const idx = src.indexOf('P0-HIST-FIX-3');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 4000);
        expect(block).toMatch(
            /_displayTotal\s*=\s*Math\.max\(\s*_activeTotal\s*,\s*_legacyTotalDays\s*\)/
        );
    });

    it('declara _expiredDaysActiveDelta = max(0, _displayTotal - _activeTotal)', () => {
        // [actualizado · P3-HIST-MISSING-DAYS-EXPIRED-CALENDAR] El cómputo
        // active-delta se renombró de `_expiredDays` a `_expiredDaysActiveDelta`
        // cuando se añadió una 2da fuente (calendar) + clamp min/max; el
        // valor final `_expiredDays` ahora es Math.min(Math.max(activeDelta,
        // calendar), maxPossible). El guard ancla la fórmula active-delta.
        const idx = src.indexOf('P0-HIST-FIX-3');
        const block = src.slice(idx, idx + 6800);
        expect(block).toMatch(
            /_expiredDaysActiveDelta\s*=\s*Math\.max\(\s*0\s*,\s*_displayTotal\s*-\s*_activeTotal\s*\)/
        );
    });

    it('missing math sigue usando _activeTotal (no _displayTotal)', () => {
        // Si missing math usara _displayTotal, contaríamos como
        // "missing" días que ya expiraron y NUNCA se generarán.
        // Eg. plan original 7, activo 6, generados 2 → si usamos
        // displayTotal: missing=5 (incorrecto, falsamente promete 1 día
        // expirado). Con activeTotal: missing=4 (correcto, esos 4 son
        // los que el cron va a entregar).
        const idx = src.indexOf('P0-HIST-FIX-3');
        // [actualizado] Slice ampliado a 6800: la lógica calendar-based
        // insertada antes de la missing-math la empujó a ~offset 6399.
        const block = src.slice(idx, idx + 6800);
        expect(block).toMatch(
            /_missingDays\s*=\s*_activeTotal\s*>\s*_planDaysLen[\s\S]*?_activeTotal\s*-\s*_planDaysLen/
        );
    });

    it('subtitle menciona "ya pasó y no aparece en el menú" cuando _expiredDays > 0', () => {
        // [P0-HIST-FIX-4 · 2026-05-09] Copy refinado: el chip ahora
        // dice "3 de 7 listos" (incluye el día expirado en el
        // numerador), pero el modal solo muestra 2 day tabs. El
        // subtitle aclara que el día expirado NO aparece en el menú
        // — sin esta línea el user se confunde "¿el chip dice 3
        // pero solo veo 2 días?".
        const idx = src.lastIndexOf('P0-HIST-FIX-2');
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(/_expiredDays\s*>\s*0/);
        expect(block).toMatch(/ya\s+pas[oó]\s+y\s+no\s+aparece/);
        expect(block).toMatch(/ya\s+pasaron\s+y\s+no\s+aparecen/);
    });

    it('subtitle cierra con "." cuando _expiredDays === 0 (sin mention)', () => {
        // Plan healthy sin shift: _expiredDays = 0 → subtitle solo
        // dice "Faltan del día N al día M." sin paréntesis adicional.
        const idx = src.lastIndexOf('P0-HIST-FIX-2');
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(/_expiredDays\s*===\s*0\s*&&\s*['"]\.\s*['"]/);
    });
});


describe('[P0-HIST-FIX-2] subtitle con rango concreto', () => {
    it('renderiza subtitle "Falta(n) <range>." debajo del header', () => {
        // Línea complementaria al título — muestra qué días
        // específicos faltan en frase natural.
        // Anchor en LAST occurrence (más cerca del render JSX) —
        // el marker aparece varias veces en el bloque (range, reason,
        // counter). El último corresponde al return del IIFE.
        const idx = src.lastIndexOf('P0-HIST-FIX-2');
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(/styles\.missingDaysSubtitle/);
        expect(block).toMatch(/Falta\{_missingDays\s*===\s*1\s*\?\s*['"]['"]\s*:\s*['"]n['"]\}/);
    });

    it('CSS .missingDaysSubtitle declarado', () => {
        expect(cssSrc).toMatch(/\.missingDaysSubtitle\s*\{/);
    });
});


describe('[P0-HIST-FIX-2] icon variable por tono', () => {
    it('cada branch del reason asigna un _icon emoji distinto', () => {
        // bad → ⚠️ ; warn → ⏸️ ; in_flight info → 🔄 ; fallback → 📅
        // Anchor específico en el comentario del reason cascade
        // (donde están los `_icon = '...'`). El lastIndexOf landeaba
        // en el counter render, que está DESPUÉS del cascade.
        // Usamos el SEGUNDO P0-HIST-FIX-2 que precede al cascade
        // (orden: range comment, copy comment, counter comment).
        const _all = [...src.matchAll(/P0-HIST-FIX-2/g)];
        expect(_all.length).toBeGreaterThanOrEqual(2);
        const idx = _all[1].index;
        // [actualizado] Slice ampliado a 7400: las ramas scheduled/running
        // (P3-HIST-CHUNK-SCHEDULED) alargaron el cascade y empujaron el
        // emoji 📅 del else hasta ~offset 6903.
        const block = src.slice(idx, idx + 7400);
        // Los 4 emojis canónicos deben aparecer asignados a _icon.
        expect(block).toMatch(/_icon\s*=\s*['"]⚠️['"]/);
        expect(block).toMatch(/_icon\s*=\s*['"]⏸️['"]/);
        expect(block).toMatch(/_icon\s*=\s*['"]🔄['"]/);
        expect(block).toMatch(/_icon\s*=\s*['"]📅['"]/);
    });

    it('header renderiza {_icon} en lugar de 📅 hardcoded', () => {
        // Sin la variable, todos los tones mostraban 📅 —
        // confuso porque el calendario no comunica "error" o
        // "esperando".
        // Anchor en LAST occurrence (más cerca del render JSX) —
        // el marker aparece varias veces en el bloque (range, reason,
        // counter). El último corresponde al return del IIFE.
        const idx = src.lastIndexOf('P0-HIST-FIX-2');
        const block = src.slice(idx, idx + 6000);
        expect(block).toMatch(
            /<span\s+className=\{styles\.missingDaysIcon\}>\{_icon\}<\/span>/
        );
    });
});


describe('[P2-HIST-AUDIT-8] CSS module classes', () => {
    it('missingDaysBlock + missingDaysHeader + missingDaysReason + missingDaysCount + missingDaysIcon definidos', () => {
        expect(cssSrc).toMatch(/\.missingDaysBlock\s*\{/);
        expect(cssSrc).toMatch(/\.missingDaysHeader\s*\{/);
        expect(cssSrc).toMatch(/\.missingDaysReason\s*\{/);
        expect(cssSrc).toMatch(/\.missingDaysCount\s*\{/);
        expect(cssSrc).toMatch(/\.missingDaysIcon\s*\{/);
        expect(cssSrc).toMatch(/\.missingDaysTitle\s*\{/);
    });

    it('tones Info/Warn/Bad definidos con palettes simétricas a status chips', () => {
        expect(cssSrc).toMatch(/\.missingDaysInfo\s*\{/);
        expect(cssSrc).toMatch(/\.missingDaysWarn\s*\{/);
        expect(cssSrc).toMatch(/\.missingDaysBad\s*\{/);
        // Bad usa rojo simétrico con statusFailed (#FEF2F2 / #991B1B).
        const badIdx = cssSrc.indexOf('.missingDaysBad');
        const badBlock = cssSrc.slice(badIdx, badIdx + 300);
        expect(badBlock).toMatch(/#FEF2F2/i);
        expect(badBlock).toMatch(/#991B1B/i);
        // Warn usa amber simétrico con statusPartial.
        const warnIdx = cssSrc.indexOf('.missingDaysWarn');
        const warnBlock = cssSrc.slice(warnIdx, warnIdx + 300);
        expect(warnBlock).toMatch(/#FFFBEB/i);
        expect(warnBlock).toMatch(/#92400E/i);
    });
});
