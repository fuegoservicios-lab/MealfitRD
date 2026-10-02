/**
 * [P1-PLAN-LOTE-961] El modo voz suena con SU señal al abrir y al cerrar (antes, solo el pitido del sistema: «bajito y
 * mediocre»). Web Audio es FALSO aquí: se prueba qué notas, en qué orden, por dónde sale y que nunca rompe nada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    MELODIA_ABRIR, MELODIA_CERRAR, DURACION_ABRIR_MS, sonarAperturaVoz, sonarCierreVoz, _reiniciarParaTests,
} from '../utils/sonidosDeVoz';
import { VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS } from '../hooks/useConversacionPorVoz';

const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
class ContextoFalso {
    constructor() { ContextoFalso.ultimo = this; this.osciladores = []; this.state = 'suspended'; this.currentTime = 1; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: param(), connect: vi.fn() }; }
    createBiquadFilter() { return { type: '', frequency: param(), connect: vi.fn() }; }
    createOscillator() {
        const o = { type: '', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        this.osciladores.push(o);
        return o;
    }
}
const fundamentales = (ctx) => ctx.osciladores.filter((_, i) => i % 2 === 0).map((o) => o.frequency.setValueAtTime.mock.calls[0][0]);

let win;
beforeEach(() => {
    _reiniciarParaTests();
    vi.useFakeTimers();
    win = { AudioContext: ContextoFalso, navigator: { audioSession: { type: 'auto' } } };
});
afterEach(() => { vi.useRealTimers(); });

describe('sonidosDeVoz', () => {
    it('abrir sube y cerrar baja, con las mismas dos notas', () => {
        expect(sonarAperturaVoz(win)).toBe(true);
        const abrir = fundamentales(ContextoFalso.ultimo);
        expect(abrir[1]).toBeGreaterThan(abrir[0]);
        ContextoFalso.ultimo.osciladores = [];
        expect(sonarCierreVoz(win)).toBe(true);
        const cerrar = fundamentales(ContextoFalso.ultimo);
        expect(cerrar[1]).toBeLessThan(cerrar[0]);
        expect([...cerrar].sort()).toEqual([...abrir].sort());
    });

    it('sinusoides con envolvente de campana: nada de onda cuadrada ni de arranque en seco', () => {
        sonarAperturaVoz(win);
        for (const o of ContextoFalso.ultimo.osciladores) expect(o.type).toBe('sine');
        for (const [, , , pico] of [...MELODIA_ABRIR, ...MELODIA_CERRAR]) expect(pico).toBeLessThanOrEqual(0.25);
    });

    it('cerrar es más suave que abrir', () => {
        const max = (m) => Math.max(...m.map((n) => n[3]));
        expect(max(MELODIA_CERRAR)).toBeLessThan(max(MELODIA_ABRIR));
    });

    it('sale por el altavoz en iOS y, al cerrar, la ruta vuelve a la de siempre', () => {
        sonarCierreVoz(win);
        expect(win.navigator.audioSession.type).toBe('playback');
        vi.advanceTimersByTime(1000);
        expect(win.navigator.audioSession.type).toBe('auto');
    });

    it('después de abrir devuelve la ruta antes de escuchar, sin dejar iOS en reproducción', () => {
        sonarAperturaVoz(win);
        expect(win.navigator.audioSession.type).toBe('playback');
        vi.advanceTimersByTime(DURACION_ABRIR_MS);
        expect(win.navigator.audioSession.type).toBe('auto');
    });

    it('la señal de abrir se apaga antes de que se abra el micrófono (no se cuela en el dictado)', () => {
        const fin = Math.max(...MELODIA_ABRIR.map(([, ini, dur]) => ini + dur)) * 1000;
        expect(fin).toBeLessThanOrEqual(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS);
        expect(DURACION_ABRIR_MS).toBeGreaterThan(fin);
    });

    it('reanuda el contexto suspendido y reutiliza uno solo (iOS limita los contextos)', () => {
        sonarAperturaVoz(win);
        const primero = ContextoFalso.ultimo;
        expect(primero.state).toBe('running');
        sonarCierreVoz(win);
        expect(ContextoFalso.ultimo).toBe(primero);
    });

    it('sin Web Audio o con el contexto roto no suena nada y no lanza', () => {
        expect(sonarAperturaVoz({ navigator: {} })).toBe(false);
        expect(sonarCierreVoz(undefined)).toBe(false);
        class Roto { constructor() { throw new Error('no'); } }
        expect(sonarAperturaVoz({ AudioContext: Roto })).toBe(false);
    });

    it('va cableado al abrir y al cerrar el modo voz, sin sonar dos veces', () => {
        const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        expect(src).not.toContain('sonarAperturaVoz');
        expect(src).not.toContain('sonarCierreVoz');
        for (const hook of ['useConversacionLive.js', 'useConversacionPorVoz.js']) {
            const transport = readFileSync(join(__dirname, '..', 'hooks', hook), 'utf8');
            expect(transport).toContain("sonarModoVoz('abrir')");
            expect(transport).toContain("sonarModoVoz('cerrar')");
        }
    });
});
