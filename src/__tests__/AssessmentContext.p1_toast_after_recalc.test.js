// [P1-REGEN-DAY-TOAST-AFTER-RECALC · 2026-08-05] El aviso de desenlace se emite
// cuando la operación TERMINA, no cuando el backend responde.
//
// Reportado con captura por el owner: el toast verde «Día actualizado» aparecía
// ENCIMA del modal que seguía diciendo «Actualizando tu día… puede tomar de 3 a 5
// minutos», con el overlay «Rediseñando tu día…» girando debajo.
//
// La causa era de ORDEN, no visual: el toast se emitía nada más recibir la
// respuesta del día, y a continuación corría el recalc de la lista de compras
// (hasta 2 intentos con una espera de 700 ms entre medias). El overlay vive hasta
// que la función retorna, así que el éxito se anunciaba con el trabajo a medias.
//
// No es cosmético: anunciar el final antes de tiempo invita a cerrar la pestaña
// durante el recalc, que es justo lo que deja la lista desincronizada del plan.
//
// Test parser-based: mismo patrón y misma razón que los demás de este archivo —
// AssessmentContext.jsx es demasiado pesado para renderizar en unitario.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _src = readFileSync(join(__dirname, '..', 'context', 'AssessmentContext.jsx'), 'utf-8');

const _idx = (marca) => {
    const i = _src.indexOf(marca);
    expect(i, `no se encontró: ${marca}`).toBeGreaterThan(-1);
    return i;
};

describe('[P1-REGEN-DAY-TOAST-AFTER-RECALC] orden del aviso de desenlace', () => {
    it('las ramas registran el aviso en vez de emitirlo al vuelo', () => {
        expect(_src).toContain('let _emitirDesenlace = () => {};');
        // Las cuatro ramas del desenlace (IA interrumpida, bajo objetivo, platos
        // conservados, éxito limpio). El patrón exige `=> toast` para no contar la
        // declaración inicial `() => {}`, que también asigna la variable.
        const registros = _src.match(/_emitirDesenlace = \(\) => toast/g) || [];
        expect(registros.length).toBe(4);
    });

    it('el aviso se emite DESPUÉS del recalc de la lista, no antes', () => {
        const iRegistro = _idx('let _emitirDesenlace = () => {};');
        const iRecalc = _idx('const _recalcOnce = async () => {');
        const iEmision = _idx('try { _emitirDesenlace(); }');
        // El registro precede al recalc; la emisión va después.
        expect(iRegistro).toBeLessThan(iRecalc);
        expect(iEmision).toBeGreaterThan(iRecalc);
    });

    it('la emisión va después del bucle de reintentos, no dentro', () => {
        const iBucle = _idx('for (let _attempt = 0; _attempt < 2 && !_recalcOk; _attempt++) {');
        const iEmision = _idx('try { _emitirDesenlace(); }');
        expect(iEmision).toBeGreaterThan(iBucle);
    });

    it('un fallo del toast no puede tumbar el flujo', () => {
        expect(_src).toMatch(/try \{ _emitirDesenlace\(\); \} catch/);
    });

    it('no queda ninguna emisión temprana de los toasts de desenlace', () => {
        const iRecalc = _idx('const _recalcOnce = async () => {');
        const antes = _src.slice(_idx('const kept = (data?.slots_kept || []).filter(Boolean);'), iRecalc);
        // En ese tramo solo puede haber REGISTROS, nunca llamadas directas.
        expect(antes).not.toMatch(/^\s*toast\.(success|warning)\(/m);
    });
});
