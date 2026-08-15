/**
 * [P1-PANTRY-RECONCILIATION · 2026-08-07] El banner que PREGUNTA.
 *
 * La regla del producto es "la Nevera solo baja por lo que el usuario
 * registra", y es la correcta. Su consecuencia inevitable: lo que come sin
 * registrar nunca sale, y a las 2-3 semanas la Nevera sobre-reporta.
 *
 * El arreglo NO es descontar automatico — eso rompe la regla y repite el pecado
 * que P1-PANTRY-NAME-RESOLUTION cerro (mover la Nevera por algo que el usuario
 * no puede auditar). El arreglo es preguntar, y que responder cueste un tap.
 *
 * Parser-based siguiendo el patron de Pantry.p3_audit_8: renderizar Pantry.jsx
 * (3400+ lineas, con AssessmentContext, caches, framer-motion y media queries)
 * cuesta mas de lo que aporta para verificar wiring. Lo que estos tests
 * protegen son decisiones que un refactor podria revertir sin que nada mas se
 * ponga rojo.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const _SRC = fs.readFileSync(
    path.resolve(__dirname, '../pages/Pantry.jsx'), 'utf8');
const _CSS = fs.readFileSync(
    path.resolve(__dirname, '../pages/Pantry.fridge.module.css'), 'utf8');

/** Cuerpo de una función declarada como `const nombre = useCallback(async (...)`. */
function _fnBody(name) {
    const i = _SRC.indexOf(`const ${name} =`);
    expect(i, `no se encontró \`${name}\` en Pantry.jsx`).toBeGreaterThan(-1);
    // Hasta la siguiente declaración de nivel superior.
    const rest = _SRC.slice(i + 10);
    const j = rest.search(/\n {4}const \w+ = /);
    return rest.slice(0, j > -1 ? j : 4000);
}

describe('P1-PANTRY-RECONCILIATION — la Nevera pregunta, no adivina', () => {
    it('el marker sigue vivo en el fuente', () => {
        expect(_SRC).toContain('P1-PANTRY-RECONCILIATION');
    });

    it('pide los candidatos al backend, no los calcula en el cliente', () => {
        // El criterio de "quieto" combina created_at + updated_at + el ledger,
        // y `updated_at` no es fiable sola (el RPC de descuento no la toca).
        // Recalcularlo en el cliente duplicaria esa logica delicada.
        const body = _fnBody('loadReconcileCandidates');
        expect(body).toMatch(/\/api\/plans\/inventory\/reconcile/);
        expect(body).not.toMatch(/days_quiet\s*[<>=]/);
    });

    it('un fallo del GET no rompe la Nevera', () => {
        // El banner es un extra; si su fetch falla, la pagina debe seguir
        // sirviendo el inventario.
        const body = _fnBody('loadReconcileCandidates');
        expect(body).toMatch(/if \(!res\.ok\) return;/);
        expect(body).toMatch(/catch \(_e\)/);
    });

    it('NO descuenta solo: no hay POST fuera del handler de respuesta', () => {
        // El invariante central de todo el workstream. Un POST disparado por el
        // efecto de carga convertiria el banner en descuento automatico.
        const carga = _fnBody('loadReconcileCandidates');
        expect(carga).not.toMatch(/method:\s*'POST'/);
    });

    it('cablea las TRES respuestas, y solo esas', () => {
        expect(_SRC).toMatch(/handleReconcile\(it, 'used'\)/);
        expect(_SRC).toMatch(/handleReconcile\(it, 'spoiled'\)/);
        expect(_SRC).toMatch(/handleReconcile\(it, 'keep'\)/);
    });

    it('`keep` no recarga el inventario; `used`/`spoiled` sí', () => {
        // `keep` no cambia cantidades — solo reinicia el reloj server-side.
        // Refetchear ahí serían N requests por nada; NO refetchear tras
        // used/spoiled dejaría la lista mostrando comida que ya no está.
        const body = _fnBody('handleReconcile');
        const iKeep = body.indexOf("action === 'keep'");
        const iRefetch = body.indexOf('fetchData(false)');
        expect(iKeep).toBeGreaterThan(-1);
        expect(iRefetch).toBeGreaterThan(iKeep);
        expect(body).toMatch(/invalidateInventoryCache\(\)/);
    });

    it('un fallo del POST no se anuncia como éxito', () => {
        const body = _fnBody('handleReconcile');
        expect(body).toMatch(/if \(!res\.ok \|\| !data\?\.success\)/);
        expect(body).toMatch(/toast\.error/);
    });

    it('el item resuelto desaparece del banner al instante', () => {
        // Sin esto el usuario contesta y la fila sigue ahí hasta el refetch:
        // parece que el tap no hizo nada y vuelve a tocarlo.
        const body = _fnBody('handleReconcile');
        expect(body).toMatch(/setReconcileItems\(\(prev\) => prev\.filter/);
    });

    it('hay guard contra doble-tap', () => {
        const body = _fnBody('handleReconcile');
        expect(body).toMatch(/if \(reconcileBusyId !== null\) return;/);
        expect(_SRC).toMatch(/disabled=\{reconcileBusyId !== null\}/);
    });

    it('el banner no se pinta cuando no hay nada que preguntar', () => {
        expect(_SRC).toMatch(/reconcileItems\.length > 0 && \(/);
    });

    it('cada botón tiene aria-label que nombra el alimento', () => {
        // Tres botones idénticos por fila: sin aria-label, un lector de
        // pantalla oye "Lo usé, Se dañó, Sigue ahí" N veces sin saber de qué.
        //
        // [P1-I18N-DASHBOARD · 2026-08-15] Antes esto exigía la PLANTILLA exacta
        // (`aria-label={`Ya usé ${it.ingredient_name}`}`). Al pasar el copy por
        // `t()` la interpolación cambió de forma y el guard se puso rojo sin que
        // se hubiera roto nada de lo que protege. Lo que importa es la PROPIEDAD
        // —existe un aria-label por acción y NOMBRA el alimento—, no cómo se
        // ensambla la cadena.
        const _lineas = _SRC.split('\n');
        for (const verbo of ['Ya usé', 'se dañó', 'sigue en la nevera']) {
            const linea = _lineas.find((l) => l.includes('aria-label') && l.includes(verbo));
            expect(linea, `sin aria-label para la acción «${verbo}»`).toBeTruthy();
            expect(linea, `el aria-label de «${verbo}» no nombra el alimento`)
                .toContain('it.ingredient_name');
        }
    });

    it('los estilos del banner existen', () => {
        for (const cls of ['.reconcileBanner', '.reconcileRow', '.reconcileActions']) {
            expect(_CSS).toContain(cls);
        }
        // Deshabilitado visible: si no se distingue, el usuario cree que la UI
        // se colgó mientras hay una respuesta en vuelo.
        expect(_CSS).toMatch(/\.reconcileActions button:disabled/);
    });
});
