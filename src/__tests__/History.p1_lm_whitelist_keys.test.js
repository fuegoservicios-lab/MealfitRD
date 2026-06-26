// [P1-HIST-LM-WHITELIST · 2026-05-09] Tests del whitelist categorizado
// de `learning_metrics` en el tab Métricas del modal del Historial.
//
// Bug original (audit Historial 2026-05-09 · gap P1-2):
//   La whitelist `_LM_DISPLAY_KEYS` tenía 5 keys (síntesis/escalación)
//   y ocultaba ~20 keys ricas que el writer del backend persiste en
//   cada chunk: `learning_repeat_pct`, `rejection_violations`,
//   `allergy_violations`, `fatigued_violations`, `sample_*` previews,
//   `inventory_activity_proxy_used`, `pantry_degraded_reason`,
//   `learning_signal_strength`, etc. Para diagnosticar "por qué este
//   chunk repitió ingredientes" había que ir a admin/SQL.
//
// Fix:
//   Whitelist categorizada en 4 grupos (`_LM_DISPLAY_GROUPS`):
//     - Síntesis y escalación (9 keys)
//     - Repetición (9 keys)
//     - Violaciones (7 keys)
//     - Pantry y señal (6 keys)
//   Total: 31 keys. Helper `_fmtLmValue` formatea según tipo
//   declarado (bool → Sí/No, pct → 1 decimal + %, severity → warn/bad
//   class si > 0, etc.).
//
// Cobertura:
//   - Anchor del marker.
//   - 4 grupos definidos con id + title + keys.
//   - Cada key tiene tuple [name, label, type] (3-arity).
//   - Catálogo completo: las keys conocidas del backend están todas
//     presentes (drift detection — si el writer agrega una nueva
//     key, este test falla y pide categorización).
//   - Helper _fmtLmValue maneja todos los types.
//   - Render: itera grupos, omite vacíos, aplica severity class.

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


describe('[P1-HIST-LM-WHITELIST] anchor + estructura del catálogo', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-LM-WHITELIST\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(cssSrc).toMatch(/\[P1-HIST-LM-WHITELIST\s*·\s*2026-05-09\]/);
    });

    it('declara _LM_DISPLAY_GROUPS (no _LM_DISPLAY_KEYS legacy)', () => {
        expect(src).toMatch(/const\s+_LM_DISPLAY_GROUPS\s*=\s*\[/);
        // El nombre antiguo NO debe sobrevivir como variable activa
        // (fuera de strings/comentarios).
        expect(src).not.toMatch(/const\s+_LM_DISPLAY_KEYS\s*=/);
    });

    it('los 4 grupos están definidos con id + title + keys', () => {
        // [anchor actualizado tras refactor: ahora hay un comentario del tab
        //  Métricas que menciona `_LM_DISPLAY_GROUPS` ANTES de la declaración
        //  (~L3340), así que anclamos en `const _LM_DISPLAY_GROUPS` para caer
        //  en la declaración real, no en el comentario.]
        const groupsIdx = src.indexOf('const _LM_DISPLAY_GROUPS');
        const block = src.slice(groupsIdx, groupsIdx + 6000);
        // Los 4 ids canónicos.
        for (const id of ['synthesis', 'repetition', 'violations', 'pantry']) {
            expect(block).toMatch(new RegExp(`id:\\s*['"]${id}['"]`));
        }
        // Títulos legibles (mezcla mayúsculas/minúsculas).
        expect(block).toMatch(/title:\s*['"]S[ií]ntesis y escalaci[oó]n['"]/);
        expect(block).toMatch(/title:\s*['"]Repetici[oó]n['"]/);
        expect(block).toMatch(/title:\s*['"]Violaciones['"]/);
        expect(block).toMatch(/title:\s*['"]Pantry y se[nñ]al['"]/);
    });
});


describe('[P1-HIST-LM-WHITELIST] catálogo cubre keys conocidas del writer', () => {
    // Las keys persistidas por `cron_tasks.py:_calculate_learning_metrics`
    // (line ~15115-15130) y por los call sites pre/post-pipeline
    // (line ~18348-19651). Cada una debe estar declarada en
    // _LM_DISPLAY_GROUPS — drift detection cross-archivo: si el
    // writer agrega una key nueva sin actualizar la UI, el grafo de
    // calidad del producto se queda mudo.
    const _BACKEND_KEYS = [
        // _calculate_learning_metrics return:
        'total_new_meals',
        'learning_repeat_pct',
        'ingredient_base_repeat_pct',
        'rejection_violations',
        'allergy_violations',
        'fatigued_violations',
        'sample_repeats',
        'sample_repeated_bases',
        'sample_rejection_hits',
        'sample_allergy_hits',
        'prior_meals_count',
        'prior_meal_bases_count',
        'rejected_count',
        'allergy_keywords_count',
        // Call sites cron_tasks.py:18348-19651:
        'shuffle_learning_applied',
        'shuffle_source',
        'pantry_quantity_violations',
        'sample_pantry_quantity_violations',
        'inventory_activity_proxy_used',
        'inventory_activity_mutations',
        'sparse_logging_proxy_used',
        'learning_signal_strength',
        'pantry_degraded_reason',
        'pantry_snapshot_age_hours_at_pickup',
        'learning_confidence',
        'pipeline_failed',
        // Síntesis legacy (pre-P1-HIST-LM-WHITELIST):
        // [removed: 'synth_quality_score' / 'synthesized_count' / 'queue_count'
        //  tras refactor — G8-LM-CATALOG-HONESTY (2026-05-29) los sacó de
        //  _LM_DISPLAY_GROUPS porque NO tienen productor en
        //  plan_chunk_queue.learning_metrics: synthesized_count/queue_count
        //  viven en chunk_lesson_telemetry (ya renderizado en el tab) y
        //  synth_quality_score no se computa en ningún lado. Ya no son keys
        //  del catálogo, así que dejan de ser drift-detectables aquí.]
        'recovery_attempts',
        'escalation_reason',
    ];

    it.each(_BACKEND_KEYS)('declara key "%s" en algún grupo de _LM_DISPLAY_GROUPS', (key) => {
        // [anchor actualizado tras refactor: ahora hay un comentario del tab
        //  Métricas que menciona `_LM_DISPLAY_GROUPS` ANTES de la declaración
        //  (~L3340), así que anclamos en `const _LM_DISPLAY_GROUPS` para caer
        //  en la declaración real, no en el comentario.]
        const groupsIdx = src.indexOf('const _LM_DISPLAY_GROUPS');
        const block = src.slice(groupsIdx, groupsIdx + 6000);
        // Cada key aparece como literal `'key_name'` (primer elem
        // de la tuple) en alguno de los grupos.
        expect(block).toMatch(new RegExp(`['"]${key}['"]`));
    });

    it('NO incluye internals que envenenarían la UI', () => {
        // [anchor actualizado tras refactor: ahora hay un comentario del tab
        //  Métricas que menciona `_LM_DISPLAY_GROUPS` ANTES de la declaración
        //  (~L3340), así que anclamos en `const _LM_DISPLAY_GROUPS` para caer
        //  en la declaración real, no en el comentario.]
        const groupsIdx = src.indexOf('const _LM_DISPLAY_GROUPS');
        const block = src.slice(groupsIdx, groupsIdx + 6000);
        // pipeline_snapshot puede ser MB de jsonb. preflight es
        // flag mecánico sin valor diagnóstico para el usuario final.
        expect(block).not.toMatch(/['"]pipeline_snapshot['"]/);
    });
});


describe('[P1-HIST-LM-WHITELIST] tipos declarados en cada tuple', () => {
    it('cada tuple tiene shape [key, label, type]', () => {
        // [anchor actualizado tras refactor: ahora hay un comentario del tab
        //  Métricas que menciona `_LM_DISPLAY_GROUPS` ANTES de la declaración
        //  (~L3340), así que anclamos en `const _LM_DISPLAY_GROUPS` para caer
        //  en la declaración real, no en el comentario.]
        const groupsIdx = src.indexOf('const _LM_DISPLAY_GROUPS');
        const block = src.slice(groupsIdx, groupsIdx + 6000);
        // Tipos válidos según _fmtLmValue switch.
        const _VALID_TYPES = [
            'number', 'int', 'pct', 'bool', 'preview',
            'severity', 'severity_high', 'hours', 'str',
        ];
        // Cada tuple en el array `keys: [...]` tiene 3 strings
        // separados por commas: ['key', 'label', 'type'].
        // Aserción defensiva: el tipo (3er string del tuple) está
        // en la whitelist de tipos válidos.
        const _tupleRegex = /\[\s*['"][a-z_]+['"]\s*,\s*['"][^'"]+['"]\s*,\s*['"]([a-z_]+)['"]\s*\]/g;
        const _matches = [...block.matchAll(_tupleRegex)];
        // Esperamos al menos 25 tuples (4 grupos con 6-9 keys c/u).
        expect(_matches.length).toBeGreaterThanOrEqual(25);
        for (const m of _matches) {
            expect(_VALID_TYPES).toContain(m[1]);
        }
    });
});


describe('[P1-HIST-LM-WHITELIST] helper _fmtLmValue', () => {
    it('helper definido como const local del IIFE', () => {
        expect(src).toMatch(/const\s+_fmtLmValue\s*=\s*\(/);
    });

    it('case "bool" devuelve "Sí"/"No"', () => {
        const helperIdx = src.indexOf('_fmtLmValue');
        // El switch del helper.
        const block = src.slice(helperIdx, helperIdx + 4500);
        expect(block).toMatch(/case\s*['"]bool['"]/);
        expect(block).toMatch(/['"]S[ií]['"][\s\S]{0,100}['"]No['"]/);
    });

    it('case "pct" eleva severity warn/bad según umbrales', () => {
        const helperIdx = src.indexOf('_fmtLmValue');
        const block = src.slice(helperIdx, helperIdx + 4500);
        expect(block).toMatch(/case\s*['"]pct['"]/);
        // Umbrales explícitos.
        expect(block).toMatch(/_n\s*>\s*60[\s\S]{0,50}['"]bad['"]/);
        expect(block).toMatch(/_n\s*>\s*20[\s\S]{0,50}['"]warn['"]/);
        // Format con 1 decimal + sufijo %.
        expect(block).toMatch(/toFixed\(1\)/);
    });

    it('case "severity" oculta valores 0 (no render para counters limpios)', () => {
        const helperIdx = src.indexOf('_fmtLmValue');
        const block = src.slice(helperIdx, helperIdx + 4500);
        expect(block).toMatch(/case\s*['"]severity['"]/);
        // El early-return cuando _n <= 0.
        expect(block).toMatch(/_n\s*<=\s*0[\s\S]{0,50}return\s+null/);
    });

    it('case "severity_high" siempre marca bad para alergias', () => {
        const helperIdx = src.indexOf('_fmtLmValue');
        const block = src.slice(helperIdx, helperIdx + 4500);
        expect(block).toMatch(/case\s*['"]severity_high['"]/);
        // severity 'bad' fijo (alergias = inmortales).
        expect(block).toMatch(/severity:\s*['"]bad['"]/);
    });

    it('case "preview" maneja arrays con strings y dicts ({meal, bases})', () => {
        // Anchor en el case directamente — el helper completo es
        // largo (~9 cases con mucho whitespace) y un slice fijo
        // desde `_fmtLmValue` puede quedarse corto.
        const caseIdx = src.indexOf("case 'preview'");
        expect(caseIdx).toBeGreaterThan(-1);
        const block = src.slice(caseIdx, caseIdx + 1500);
        expect(block).toMatch(/case\s*['"]preview['"]/);
        // Acceso a `.meal` para dicts (sample_repeated_bases).
        expect(block).toMatch(/_first\.meal/);
        // Truncate primer item.
        expect(block).toMatch(/_txt\.length\s*>\s*28/);
    });

    it('case "hours" eleva severity con umbrales 12/48', () => {
        const helperIdx = src.indexOf('_fmtLmValue');
        const block = src.slice(helperIdx, helperIdx + 4500);
        expect(block).toMatch(/case\s*['"]hours['"]/);
        expect(block).toMatch(/_n\s*>\s*48[\s\S]{0,50}['"]bad['"]/);
        expect(block).toMatch(/_n\s*>\s*12[\s\S]{0,50}['"]warn['"]/);
    });

    it('valores null/undefined → null (no render)', () => {
        const helperIdx = src.indexOf('_fmtLmValue');
        const block = src.slice(helperIdx, helperIdx + 4500);
        expect(block).toMatch(/v\s*===\s*null\s*\|\|\s*v\s*===\s*undefined/);
    });
});


describe('[P1-HIST-LM-WHITELIST] render por grupo', () => {
    it('itera _renderedGroups con sub-header lmGroupTitle', () => {
        const renderIdx = src.indexOf('_renderedGroups');
        expect(renderIdx).toBeGreaterThan(-1);
        const block = src.slice(renderIdx, renderIdx + 2500);
        expect(block).toMatch(/_renderedGroups\.map/);
        expect(block).toMatch(/lmGroupTitle/);
        expect(block).toMatch(/lmGroupItems/);
    });

    it('omite grupos sin items (filter Boolean)', () => {
        // Cuando un chunk solo persistió métricas de síntesis y no
        // las de violaciones, el grupo "Violaciones" entero debe
        // omitirse del render — no mostrar mini-card vacía.
        const renderIdx = src.indexOf('_renderedGroups');
        const block = src.slice(renderIdx, renderIdx + 2000);
        expect(block).toMatch(/\.filter\(Boolean\)/);
    });

    it('aplica clase de severity (tierBadgeBad / tierBadgeWarn) por item', () => {
        // Anchor en `_sevCls` — único nombre del switch local del
        // render. Rodea exactamente la lógica de severity → class.
        const sevIdx = src.indexOf('_sevCls');
        expect(sevIdx).toBeGreaterThan(-1);
        const block = src.slice(sevIdx, sevIdx + 800);
        expect(block).toMatch(/severity\s*===\s*['"]bad['"]/);
        expect(block).toMatch(/severity\s*===\s*['"]warn['"]/);
        expect(block).toMatch(/styles\.tierBadgeBad/);
        expect(block).toMatch(/styles\.tierBadgeWarn/);
    });

    it('container raíz usa lmGroupsContainer', () => {
        const renderIdx = src.indexOf('_renderedGroups');
        const block = src.slice(renderIdx, renderIdx + 2500);
        expect(block).toMatch(/lmGroupsContainer/);
    });
});


describe('[P1-HIST-LM-WHITELIST] CSS del bloque agrupado', () => {
    it('clases definidas: lmGroupsContainer / lmGroup / lmGroupTitle / lmGroupItems', () => {
        for (const cls of ['lmGroupsContainer', 'lmGroup', 'lmGroupTitle', 'lmGroupItems']) {
            // Selector simple `.cls {` o compuesto `.cls,`.
            expect(cssSrc).toMatch(new RegExp(`\\.${cls}\\s*[\\{,]`));
        }
    });

    it('lmGroup usa background gris claro (info, no severity)', () => {
        // Mini-card neutro — los chips dentro pueden ser tier
        // warn/bad, pero el contenedor no debe alarmar por sí solo.
        const blockMatch = cssSrc.match(/\.lmGroup\s*\{[\s\S]*?\}/);
        expect(blockMatch).toBeTruthy();
        expect(blockMatch[0]).toMatch(/background:\s*#FAFAFA|#F\w{5}/i);
    });
});
