// [P1-PLAN-LOTE-157 · 2026-09-22] El techo de SILENCIO del turno, en el cliente.
//
// El presupuesto total del servidor (120 s) se comprueba al principio de su bucle de eventos:
// solo corre cuando LLEGA un evento — la misma limitación que P2-CHAT-STREAM-INACTIVITY-POSTHOC
// documentó y aceptó a propósito. Si el grafo se queda mudo de verdad no hay evento que lo
// dispare, y este lado no tenía tope propio: `fetchWithAuth` limpia su temporizador al llegar
// las cabeceras (para no romper el SSE), así que el usuario podía quedarse en «Pensando…» hasta
// rendirse. Un tester que se queda mirando fuerza el cierre de la app y reporta «se congeló».
//
// Lo que hace esto posible SIN cambiar una espera infinita por una pérdida es el lote 156: al
// cortar se empuja un `502`, que es la puerta por la que el cliente le pregunta al servidor si
// la respuesta llegó igual.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hayQueCortarPorSilencio, SILENCIO_MAXIMO_MS } from '../utils/silencioDelStream';

describe('[P1-PLAN-LOTE-157] cuándo un turno mudo deja de merecer la espera', () => {
    it('cinco minutos sin un solo evento: se corta', () => {
        expect(hayQueCortarPorSilencio(300_001, 0)).toBe(true);
    });

    it('justo en el umbral todavía NO se corta', () => {
        expect(hayQueCortarPorSilencio(SILENCIO_MAXIMO_MS, 0)).toBe(false);
    });

    it('una tool legítima que calla 4 minutos sobrevive', () => {
        // La ventana de inactividad del servidor se subió a 360 s por env justamente porque un
        // `modify_single_meal` con reintento de despensa pasa 2-4 min dentro de un nodo sin
        // emitir nada. Cortar antes repetiría el defecto que el POSTHOC tuvo que deshacer.
        expect(hayQueCortarPorSilencio(240_000, 0)).toBe(false);
    });

    it('cualquier evento reinicia el reloj: mira el ÚLTIMO, no el total del turno', () => {
        // Turno de 10 minutos pero con un evento hace 20 s: está vivo.
        expect(hayQueCortarPorSilencio(600_000, 580_000)).toBe(false);
    });

    it('un reloj que va hacia atrás no mata el turno', () => {
        // Suspensión del móvil / cambio de hora: ante la duda, se deja vivir.
        expect(hayQueCortarPorSilencio(1_000, 500_000)).toBe(false);
    });

    it('valores no numéricos no cortan nada', () => {
        expect(hayQueCortarPorSilencio(NaN, 0)).toBe(false);
        expect(hayQueCortarPorSilencio(0, undefined)).toBe(false);
    });

    it('el umbral es de 5 minutos, y está declarado', () => {
        expect(SILENCIO_MAXIMO_MS).toBe(300_000);
    });
});

describe('[P1-PLAN-LOTE-157] el chat lo usa y distingue quién abortó', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf-8');

    it('hay un vigilante que mira mientras el lector está bloqueado', () => {
        // `await reader.read()` no vuelve si no llega nada: una comprobación dentro del bucle
        // nunca correría. Por eso es un temporizador y no un `if`.
        expect(src).toContain("import { hayQueCortarPorSilencio } from '../utils/silencioDelStream'");
        expect(src).toContain('const _vigilante = setInterval(() => {');
        expect(src).toContain('hayQueCortarPorSilencio(_reloj(), _ultimoEventoEn)');
    });

    it('cada lectura reinicia el reloj del silencio', () => {
        expect(src).toContain('_ultimoEventoEn = _reloj();');
    });

    it('el corte del vigilante pinta un 502; el de «Detener» sigue sin pintar nada', () => {
        const i = src.indexOf("if (error.name === 'AbortError') {");
        expect(i).toBeGreaterThan(-1);
        const bloque = src.slice(i, i + 1400);
        expect(bloque).toContain('if (_cortadoPorSilencio) {');
        expect(bloque).toContain('status: 502,');
        // El 502 es la puerta del rescate del 156: sin eso, cortar sería perder la respuesta.
        const rescate = fs.readFileSync(path.resolve(__dirname, '..', 'utils', 'rescateDelTurno.js'), 'utf-8');
        expect(rescate).toContain('ESTADOS_DE_CORTE = [0, 502]');
    });

    it('el vigilante muere con el turno', () => {
        // Un setInterval que sobrevive a su turno acabaría abortando el siguiente.
        expect(src).toContain('if (_vigilanteDelSilencio) { clearInterval(_vigilanteDelSilencio); _vigilanteDelSilencio = null; }');
    });
});
