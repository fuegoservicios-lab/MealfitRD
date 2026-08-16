/**
 * [P1-HYDRATE-DERIVED-FIELDS · 2026-08-16] Los micronutrientes se congelaban.
 *
 * El merge de `hydrateLatestPlan` (el que corre en el poll de 25s, en el wake y en
 * el focus) era una lista blanca de CUATRO campos: `days`, `generation_status`,
 * `total_days_requested` e `id`. Todo lo demás se conservaba del estado local.
 *
 * `micronutrient_report` no es estado local: lo deriva el servidor DE ESOS MISMOS
 * `days` y lo recalcula en tres superficies (merge del chunk, cada avance de la
 * ventana rolling, y el swap/regen de un día). Adoptar los días nuevos y quedarse
 * con los micros viejos es incoherente por construcción — y como el merge se
 * persiste en `mealfit_plan`, el estado congelado sobrevivía a la navegación.
 * Refrescar la página lo arreglaba porque ese camino adopta el plan ENTERO.
 *
 * Lo mismo valía, sin que nadie lo hubiera notado, para las 4 listas de compra.
 *
 * Estos tests no montan el provider: leen el fuente. La lógica vive dentro de un
 * callback de `setPlanData` anidado en un `useCallback` con cuatro guards previos
 * (adopt / veto / adopt-sin-días / merge), y montarlo para llegar hasta ahí mide
 * el andamio, no la regla.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const CTX = path.resolve(_dir, '../context/AssessmentContext.jsx');
const fuente = fs.readFileSync(CTX, 'utf8');

/** El fuente sin comentarios: en este repo son largos por diseño y ya han hecho
 *  fallar guards por citar el código que vigilan.
 *
 *  ⚠️ El `split` es por `/\r?\n/`, no por `'\n'`. Este repo guarda en CRLF y en
 *  JavaScript `.` NO casa `\r` (es terminador de línea), así que con líneas
 *  acabadas en `\r` el `.*$` de un comentario de línea nunca llega al final y el
 *  `replace` no sustituye NADA. El limpiador no fallaba: no limpiaba, en silencio,
 *  y la ventana de búsqueda se llenaba del propio comentario que se vigila. */
function sinComentarios(txt) {
    return txt
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/)
        .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
        .join('\n');
}

const codigo = sinComentarios(fuente);

/** Ventana de código alrededor de un ancla.
 *
 *  Centrada, no hacia adelante: en dos de los tres merges el ancla más estable es
 *  el marcador de operación (`_day_regen_inflight`), que va al FINAL de la lista,
 *  así que cortar hacia adelante dejaba fuera justo los campos que se vigilan.
 *  Lo descubrí con este test en rojo contra el código correcto. */
function cuerpoDe(ancla, atras = 1400, adelante = 1400) {
    const i = codigo.indexOf(ancla);
    expect(i, `no encontré ${ancla} en AssessmentContext.jsx`).toBeGreaterThan(-1);
    return codigo.slice(Math.max(0, i - atras), i + adelante);
}

describe('la lista SSOT de campos derivados del servidor', () => {
    it('existe, está congelada y nombra los campos que el servidor recalcula', async () => {
        const mod = await import('../context/AssessmentContext.jsx');
        const lista = mod.CAMPOS_DERIVADOS_DEL_SERVIDOR;
        expect(Array.isArray(lista)).toBe(true);
        expect(Object.isFrozen(lista)).toBe(true);
        for (const campo of [
            'micronutrient_report',
            'micronutrient_supplement_advice',
            'aggregated_shopping_list',
            'aggregated_shopping_list_weekly',
            'aggregated_shopping_list_biweekly',
            'aggregated_shopping_list_monthly',
        ]) {
            expect(lista, `falta ${campo}: se quedaría viejo tras cada bloque nuevo`).toContain(campo);
        }
    });

    it('NO incluye los marcadores de operación en curso', () => {
        // Adoptarlos desde un poll pisaría el estado local de un regen vivo.
        return import('../context/AssessmentContext.jsx').then((mod) => {
            for (const marcador of ['_day_regen_inflight', '_meal_regen_inflight']) {
                expect(mod.CAMPOS_DERIVADOS_DEL_SERVIDOR).not.toContain(marcador);
            }
        });
    });
});

describe('hydrateLatestPlan adopta lo derivado', () => {
    const cuerpo = cuerpoDe('const merged = {');

    it('recorre la lista SSOT en vez de llevar la suya a mano', () => {
        expect(
            /CAMPOS_DERIVADOS_DEL_SERVIDOR/.test(cuerpo),
            'El merge del poll volvió a una lista propia (o a ninguna): los micronutrientes ' +
            'se congelarán otra vez y el usuario tendrá que refrescar la página.'
        ).toBe(true);
    });

    it('ADOPTA si el campo viene, y NO borra si falta', () => {
        // La distinción es la que separa este merge de sus dos hermanos.
        // `/swap-meal/persist` y `/regenerate-day` vacían a propósito las 4 listas
        // de compra para forzar el recálculo; el poll dispara en momentos
        // arbitrarios, así que un tick dentro de esa ventana las borraría del
        // estado local sin que nadie garantice el recálculo siguiente.
        const bucle = cuerpo.slice(cuerpo.indexOf('CAMPOS_DERIVADOS_DEL_SERVIDOR'));
        const hastaElCierre = bucle.slice(0, bucle.indexOf('}') + 1);
        expect(
            /\bin\s+newPlanData\b/.test(hastaElCierre),
            'El bucle ya no comprueba la PRESENCIA del campo en la respuesta del servidor.'
        ).toBe(true);
        expect(
            /\bdelete\b/.test(hastaElCierre),
            'Apareció un `delete` en el merge del poll. Es correcto en `applyRegenPlan` y ' +
            '`applySwappedPlan` (van anclados a un persist tras el cual el frontend recalcula), ' +
            'pero aquí borraría las listas de compra si el tick cae en la ventana post-swap.'
        ).toBe(false);
    });
});

describe('los tres merges de plan cubren los campos que importan', () => {
    // La causa raíz no fue un olvido: fue que cada merge llevaba su propia lista.
    // Dos ya habían divergido entre sí y la tercera no existía.
    const SITIOS = [
        ['hydrateLatestPlan (poll/wake/focus)', 'const merged = {'],
        ['applyRegenPlan (regenerar día)', "'_day_regen_inflight'"],
        ['applySwappedPlan (cambiar plato)', "'_meal_regen_inflight'"],
    ];

    for (const [nombre, ancla] of SITIOS) {
        it(`${nombre} adopta micronutrient_report y las listas de compra`, () => {
            const cuerpo = cuerpoDe(ancla);
            const usaSSOT = /CAMPOS_DERIVADOS_DEL_SERVIDOR/.test(cuerpo);
            const nombraMicros = /micronutrient_report/.test(cuerpo);
            const nombraLista = /aggregated_shopping_list/.test(cuerpo);
            expect(
                usaSSOT || (nombraMicros && nombraLista),
                `Este merge dejó de adoptar campos derivados. Con los días nuevos y lo ` +
                `derivado viejo, la pantalla queda incoherente hasta que el usuario refresque.`
            ).toBe(true);
        });
    }
});
