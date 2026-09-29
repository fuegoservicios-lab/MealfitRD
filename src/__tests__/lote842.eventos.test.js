/**
 * [P1-PLAN-LOTE-842 · 2026-09-29] La LISTA CERRADA de lo que la app manda a PostHog por su cuenta.
 *
 * Con el autocapture apagado (lote840.test.js), a PostHog solo le llegan las pantallas y los eventos propios de
 * `trackEvent`. La Política de Privacidad (§7 y §8) promete que ninguno lleva datos del perfil ni de salud. Esta
 * prueba lee el código con un parser real y exige tres cosas:
 * - cada `trackEvent` usa un nombre literal de esta lista;
 * - sus propiedades son exactamente las claves permitidas (sin `...spread`, que colaría cualquier cosa);
 * - `identify` va sin propiedades y nada más llama al SDK.
 *
 * Añadir un evento o una propiedad es legítimo, pero obliga a pasar por aquí y a mirar si la política lo cubre.
 * Así cayó `meal_name` de los eventos de receta: el nombre de un plato puede delatar una dieta médica.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';

const traverse = traverseMod.default || traverseMod;
const SRC = path.resolve(__dirname, '..');

const PERMITIDOS = {
    coach_voz_abierto: [],
    coach_voz_cerrado: [],
    coach_voz_minimizado: [],   // lote 688: minimizar el modo voz a burbuja, sin propiedades
    coach_voz_turno: [],
    dashboard_initial_inventory_stale: ['reason', 'user_id'],
    locale_changed: ['a', 'de', 'resultado'],
    pdf_download_failed: ['duration', 'error_message', 'error_name', 'plan_id', 'user_id'],
    pdf_download_success: ['delta_items_removed', 'density', 'duration', 'fresh_inventory_stale', 'is_plan_expired',
        'multi_page', 'plan_id', 'total_items', 'user_id'],
    pdf_prefetch_drift_corrected: ['latest_modified_at', 'local_modified_at', 'plan_id', 'user_id'],
    pdf_render_coherence_block_leak: ['entries_count', 'plan_id'],
    pdf_stale_inventory_fallback: ['fallback_inventory_size', 'reason', 'user_id'],
    plan_generated: ['days'],
    plan_regeneration_triggered: ['has_pantry', 'is_expired', 'reason', 'source', 'type'],
    recipe_pdf_download_failed: ['error_message', 'error_name', 'meal_type', 'plan_id'],
    recipe_pdf_download_success: ['fit_font_px', 'ingredients_count', 'is_expanded', 'meal_type', 'plan_id',
        'recipe_steps'],
    restock_stale_inventory_fallback: ['fallback_strategy', 'reason', 'user_id'],
    subscription_activated: ['coupon', 'isAnnual', 'tier'],
};

const ficherosDe = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : ficherosDe(p);
    return /\.(jsx?|mjs)$/.test(e.name) ? [p] : [];
});

const llamadas = [];
const sdk = [];
for (const archivo of ficherosDe(SRC)) {
    const codigo = fs.readFileSync(archivo, 'utf8');
    if (!/trackEvent|posthog/.test(codigo)) continue;
    const ast = parse(codigo, { sourceType: 'module', plugins: ['jsx'] });
    const rel = path.relative(SRC, archivo).split(path.sep).join('/');
    traverse(ast, {
        CallExpression(camino) {
            const { callee, arguments: args } = camino.node;
            const nombre = callee.type === 'Identifier' ? callee.name
                : callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null;
            if (nombre === 'trackEvent') {
                const [evento, datos] = args;
                llamadas.push({
                    rel,
                    evento: evento?.type === 'StringLiteral' ? evento.value : null,
                    claves: !datos ? [] : datos.type === 'ObjectExpression'
                        ? datos.properties.map((p) => (p.type === 'SpreadElement' ? '...spread' : (p.key.name ?? p.key.value)))
                        : ['<no es un objeto literal>'],
                });
            }
            const esPosthog = callee.type === 'MemberExpression' && (
                (callee.object.type === 'Identifier' && callee.object.name === 'posthog')
                || (callee.object.type === 'MemberExpression' && callee.object.property?.name === 'posthog'));
            if (esPosthog) sdk.push({ rel, metodo: callee.property.name, nArgs: args.length });
        },
    });
}

describe('P1-PLAN-LOTE-842 · lo que la app manda a PostHog es una lista cerrada', () => {
    it('encuentra los eventos (la prueba no pasa en vacío)', () => {
        expect(llamadas.length).toBeGreaterThanOrEqual(15);
    });

    it('cada trackEvent usa un nombre literal permitido y exactamente sus claves', () => {
        const fuera = llamadas
            .filter(({ evento, claves }) => !evento || !PERMITIDOS[evento]
                || [...claves].sort().join(',') !== [...PERMITIDOS[evento]].sort().join(','))
            .map(({ rel, evento, claves }) => `${rel}: ${evento ?? '<nombre no literal>'} {${claves.join(', ')}}`);
        expect(fuera).toEqual([]);
    });

    it('solo analytics.js captura y solo posthogClient.js arranca e identifica; nada más llama al SDK', () => {
        const usos = sdk.map(({ rel, metodo }) => `${rel}:${metodo}`).sort();
        expect(usos).toEqual(
            ['utils/analytics.js:capture', 'utils/posthogClient.js:identify', 'utils/posthogClient.js:init'].sort());
    });

    it('identify va sin propiedades del perfil: la app lo llama solo con el id', () => {
        const contexto = fs.readFileSync(path.join(SRC, 'context/AssessmentContext.jsx'), 'utf8');
        const usos = contexto.match(/identifyPostHog\([^)]*\)/g) || [];
        expect(usos.length).toBeGreaterThan(0);
        for (const uso of usos) expect(uso).toMatch(/^identifyPostHog\([^,]+\)$/);
    });
});
