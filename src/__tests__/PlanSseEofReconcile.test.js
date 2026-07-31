/**
 * [P1-SSE-EOF-RECONCILE · 2026-07-31] El stream puede terminar de dos formas y solo
 * una preguntaba al servidor.
 *
 * Incidente real (31 jul, 01:43): el pipeline terminó bien (aprobado, 313s) pero el
 * generador SSE murió antes del postproceso. El backend lo detectó y persistió por su
 * cuenta:
 *
 *     [P2-PIPELINE-TASK-DONE-COMPLETE] Pipeline OK pero SSE generator murió
 *     pre-postprocess. Ejecutando fallback persist + KV mark complete.
 *
 * En el cliente, un stream que CIERRA sin evento `complete` lanzaba
 * `Error('Stream cerrado sin resultado completo')` SIN `code`, así que no encajaba en
 * ninguna rama del catch y caía al `else` genérico → fallback al endpoint síncrono →
 * OTRO pipeline completo, con el plan ya guardado en la base.
 *
 * Ese coste ya estaba MEDIDO en el propio Plan.jsx para la causa vecina
 * (P6-CANCEL-SIGNAL-CHECK: "1.5 min de cuota LLM gastada"), y se cerró chequeando
 * `signal.aborted` — que solo cubre el cancel del usuario. Mismo throw, otra causa,
 * sin ruta.
 *
 * Por qué NO se enruta a ciegas como `sse_idle`: el silencio implica backend vivo, el
 * cierre no implica nada. Por eso se pregunta a `pending-status` y se decide:
 * complete/generating → reconciliar; none → el fallback síncrono SIGUE siendo correcto.
 *
 * ALCANCE DE ESTE TEST: es parser-based, o sea que NO ejecuta el handler — vive dentro
 * del componente, detrás de un stream. Ancla el contrato (el código existe, se consulta
 * al servidor, se distingue por respuesta) y NO puede demostrar el comportamiento en
 * runtime. La verificación de eso fue leer el journal de producción del incidente.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAN = readFileSync(join(__dirname, '..', 'pages', 'Plan.jsx'), 'utf-8');

/** Recorta el cuerpo del handler por ORDEN RELATIVO, no por ventana de bytes:
 *  desde su rama hasta la rama hermana `sse_idle`, que siempre va después. */
const cuerpoDelHandler = () => {
    const i = PLAN.indexOf("if (error.code === 'sse_eof_no_result')");
    expect(i, 'desapareció la rama sse_eof_no_result del catch').toBeGreaterThan(-1);
    const j = PLAN.indexOf("if (error.code === 'sse_idle')", i);
    expect(j, 'no se encontró la rama hermana sse_idle tras la nueva').toBeGreaterThan(i);
    return PLAN.slice(i, j);
};

describe('[P1-SSE-EOF-RECONCILE] un stream cerrado sin resultado no regenera a ciegas', () => {
    it('el throw de EOF lleva code (sin él no hay ruta posible)', () => {
        const i = PLAN.indexOf("'Stream cerrado sin resultado completo'");
        expect(i, 'desapareció el throw de EOF').toBeGreaterThan(-1);
        // El `code` se asigna junto al throw, no en otra parte del archivo.
        const ventana = PLAN.slice(i, PLAN.indexOf('throw', i) + 200);
        expect(ventana).toMatch(/code\s*=\s*'sse_eof_no_result'/);
    });

    it('el handler PREGUNTA al servidor antes de decidir', () => {
        expect(cuerpoDelHandler()).toMatch(/pending-status/);
    });

    it("con 'complete' o 'generating' reconcilia y NO cae al fallback", () => {
        const cuerpo = cuerpoDelHandler();
        expect(cuerpo).toMatch(/'complete'/);
        expect(cuerpo).toMatch(/'generating'/);
        expect(cuerpo).toMatch(/reconcileRef\.current\?\.\('watchdog'\)/);
        // El `return` es lo que impide el segundo pipeline: sin él, reconcilia Y regenera.
        expect(cuerpo).toMatch(/return;/);
    });

    it("con 'none' NO retorna: deja caer al fallback síncrono, que ahí sí es correcto", () => {
        const cuerpo = cuerpoDelHandler();
        // Un `return` incondicional al final de la rama mataría el fallback para el caso
        // en que de verdad no hay nada corriendo — cambiar un fallo por su simétrico.
        // El contrato: la rama termina SIN return en el camino 'none'.
        const lineas = cuerpo.trimEnd().split('\n');
        const ultimaSustantiva = [...lineas].reverse().find((l) => l.trim() && !l.trim().startsWith('//'));
        expect(ultimaSustantiva.trim()).not.toBe('return;');
    });

    it('la rama del cancel de usuario sigue ganando (P6-CANCEL-SIGNAL-CHECK)', () => {
        // El chequeo de `signal.aborted` vive en el catch INTERNO y convierte el error en
        // "UserCancelled" antes de que llegue aquí. Si alguien lo mueve o lo borra, un
        // cancel volvería a verse como EOF y este handler consultaría al servidor por algo
        // que el usuario ya decidió abortar.
        const iSignal = PLAN.indexOf("signal.reason === 'UserCancelled'");
        const iEof = PLAN.indexOf("eofErr.code = 'sse_eof_no_result'");
        expect(iSignal, 'desapareció el guard de cancel del usuario').toBeGreaterThan(-1);
        expect(iEof).toBeGreaterThan(-1);
    });
});
