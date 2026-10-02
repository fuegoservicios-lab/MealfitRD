/**
 * [P1-PLAN-LOTE-682] Modo voz del coach: oír con el reconocimiento del dictado, hablar con `speechSynthesis`.
 * Reconocimiento y voz son FALSOS aquí (jsdom no trae ninguno): lo que se prueba es qué se dice, en qué orden, y el
 * bucle escuchar → enviar → hablar → escuchar con sus salidas (interrumpir, no oír nada, turno sin respuesta).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearVozDelCoach, elegirVoz, textoParaHablar, trocearParaVoz } from '../utils/vozDelCoach';
import {
    useConversacionPorVoz,
    VOZ_FIN_DE_FRASE_MS,
    VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS,
    VOZ_SIN_VOZ_MS,
    silencioParaTerminar,
} from '../hooks/useConversacionPorVoz';
import ModoVoz from '../components/agent/ModoVoz';
import { sonarModoVoz } from '../utils/sonidosModoVoz';
vi.mock('../utils/sonidosModoVoz', () => ({ sonarModoVoz: vi.fn() }));

// ── dobles ──────────────────────────────────────────────────────────────────────────────────────────────────────
let habladas = [];
let ultimaLocucion = null;
class LocucionFalsa {
    constructor(text) { this.text = text; }
}
const sintesisFalsa = {
    speak(u) {
        ultimaLocucion = u;
        if (u.text.trim()) habladas.push(u.text);
        setTimeout(() => { u.onstart?.(); setTimeout(() => u.onend?.(), 5); }, 0);
    },
    cancel: vi.fn(),
    getVoices: () => [
        { lang: 'es-ES', name: 'Mónica' },
        { lang: 'es-US', name: 'Google español de Estados Unidos' },
        { lang: 'en-US', name: 'Samantha' },
    ],
    addEventListener() {},
    removeEventListener() {},
};
class ReconocimientoFalso {
    constructor() { ReconocimientoFalso.ultimo = this; }
    start() { setTimeout(() => this.onstart?.(), 0); }
    stop() { setTimeout(() => this.onend?.(), 0); }
    abort() { setTimeout(() => this.onend?.(), 0); }
    decir(texto, final = false) {
        const r = [[{ transcript: texto }]];
        r[0].isFinal = final;
        this.onresult?.({ results: r });
    }
}

beforeEach(() => {
    habladas = [];
    ultimaLocucion = null;
    ReconocimientoFalso.ultimo = null;
    sintesisFalsa.cancel.mockClear();
    sonarModoVoz.mockClear();
    window.speechSynthesis = sintesisFalsa;
    window.SpeechSynthesisUtterance = LocucionFalsa;
    window.webkitSpeechRecognition = ReconocimientoFalso;
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    delete window.webkitSpeechRecognition;
});

const avanzar = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

// ── qué se dice ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('textoParaHablar', () => {
    it('quita formato, emojis y etiquetas de la UI, y dice las unidades enteras', () => {
        expect(textoParaHablar('Listo, anoté **2 huevos** (~140 kcal). 🍳 [UI_ACTION:REFRESH_INVENTORY]'))
            .toBe('Listo, anoté 2 huevos (aproximadamente 140 calorías).');
        expect(textoParaHablar('- Arroz: 150g\n- Pollo: 120 g')).toBe('Arroz: 150 gramos. Pollo: 120 gramos');
        expect(textoParaHablar('Te faltan ~30 g de proteína', 'en-US')).toBe('Te faltan about 30 grams de proteína');
        expect(textoParaHablar('Mira [la receta](https://x.y/z) aquí https://a.b')).toBe('Mira la receta aquí');
    });

    it('trocea en frases y parte las largas (Chrome corta una locución de más de ~15 s)', () => {
        expect(trocearParaVoz('Hola. ¿Cómo vas? Bien')).toEqual(['Hola.', '¿Cómo vas?', 'Bien']);
        const larga = `${'palabra '.repeat(60)}fin.`;
        const trozos = trocearParaVoz(larga, 180);
        expect(trozos.length).toBeGreaterThan(1);
        for (const t of trozos) expect(t.length).toBeLessThanOrEqual(180);
    });

    it('para es-DO prefiere una voz latinoamericana, y la de mejor calidad', () => {
        expect(elegirVoz(sintesisFalsa.getVoices(), 'es-DO').lang).toBe('es-US');
        expect(elegirVoz(sintesisFalsa.getVoices(), 'en-US').name).toBe('Samantha');
        expect(elegirVoz([], 'es-DO')).toBeNull();
    });
});

describe('crearVozDelCoach', () => {
    it('encadena las frases en orden y avisa al vaciarse; cancelar corta la cola', async () => {
        const alVaciarse = vi.fn();
        const voz = crearVozDelCoach({ win: window, locale: 'es-DO', alVaciarse });
        voz.encolar('Primera frase. Segunda frase.');
        expect(voz.ocupada).toBe(true);
        expect(ultimaLocucion.voice.lang).toBe('es-US');
        await avanzar(30);
        expect(habladas).toEqual(['Primera frase.', 'Segunda frase.']);
        expect(alVaciarse).toHaveBeenCalled();
        expect(voz.ocupada).toBe(false);
        voz.encolar('Otra. Y otra.');
        voz.cancelar();
        expect(sintesisFalsa.cancel).toHaveBeenCalled();
        expect(voz.ocupada).toBe(false);
    });
});

// ── el bucle ────────────────────────────────────────────────────────────────────────────────────────────────────
describe('useConversacionPorVoz', () => {
    const montar = (enviar) => renderHook(() => useConversacionPorVoz({ locale: 'es-DO', enviar, saludo: 'Te escucho.' }));

    it('saluda, escucha, envía al callar, dice la respuesta y vuelve a escuchar', async () => {
        let terminarTurno;
        const enviar = vi.fn(() => new Promise((r) => { terminarTurno = r; }));
        const { result } = montar(enviar);
        expect(result.current.disponible).toBe(true);

        act(() => result.current.abrir());
        expect(result.current.abierto).toBe(true);
        act(() => result.current.abrir());
        expect(sonarModoVoz.mock.calls).toEqual([['abrir']]);
        await avanzar(20);
        expect(habladas).toEqual(['Te escucho.']);
        await avanzar(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 10);
        expect(result.current.estado).toBe('escuchando');

        act(() => ReconocimientoFalso.ultimo.decir('me comí dos huevos'));
        expect(result.current.oido).toBe('me comí dos huevos');
        await avanzar(VOZ_FIN_DE_FRASE_MS + 10);
        expect(enviar).toHaveBeenCalledWith('me comí dos huevos');
        expect(result.current.estado).toBe('pensando');

        act(() => result.current.hablar('Listo, anoté **2 huevos** (~140 kcal).'));
        await avanzar(1);
        expect(result.current.estado).toBe('hablando');
        expect(result.current.dicho).toBe('Listo, anoté 2 huevos (aproximadamente 140 calorías).');

        await act(async () => { terminarTurno(); });
        await avanzar(20);
        await avanzar(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 10);
        expect(result.current.estado).toBe('escuchando');
        act(() => result.current.cerrar());
        expect(result.current.abierto).toBe(false);
        expect(sintesisFalsa.cancel.mock.invocationCallOrder.at(-1)).toBeLessThan(sonarModoVoz.mock.invocationCallOrder.at(-1));
        act(() => result.current.cerrar());
        expect(sonarModoVoz.mock.calls).toEqual([['abrir'], ['cerrar']]);
    });

    it('sin oír nada se pausa, y un turno sin respuesta no vuelve a abrir el micrófono', async () => {
        const enviar = vi.fn(() => Promise.resolve());
        const { result } = montar(enviar);
        act(() => result.current.abrir());
        await avanzar(20 + VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 10);
        expect(result.current.estado).toBe('escuchando');
        await avanzar(VOZ_SIN_VOZ_MS + 10);
        expect(result.current.estado).toBe('pausa');

        act(() => result.current.tocar());          // volver a escuchar
        await avanzar(10);
        expect(result.current.estado).toBe('escuchando');
        act(() => ReconocimientoFalso.ultimo.decir('hola', true));
        await avanzar(silencioParaTerminar('hola') + 10);   // [P1-PLAN-LOTE-686] una palabra espera más
        await avanzar(10);
        expect(enviar).toHaveBeenCalledWith('hola');
        expect(result.current.estado).toBe('pausa');
        expect(result.current.error).toMatch(/No hubo respuesta/);
    });

    it('si el navegador niega el micrófono sin toque (Safari), sigue por toques y sin error de permisos', async () => {
        const enviar = vi.fn(() => Promise.resolve());
        const { result } = montar(enviar);
        act(() => result.current.abrir());
        await avanzar(20 + VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 10);   // arranque automático tras el saludo
        const rec = ReconocimientoFalso.ultimo;
        act(() => { rec.onerror?.({ error: 'not-allowed' }); rec.onend?.(); });
        expect(result.current.estado).toBe('pausa');
        expect(result.current.error).toBeNull();

        act(() => result.current.tocar());                          // con toque sí arranca
        await avanzar(10);
        expect(result.current.estado).toBe('escuchando');
    });

    it('tocar mientras habla lo interrumpe y, acabado el turno, escucha', async () => {
        let terminarTurno;
        const enviar = vi.fn(() => new Promise((r) => { terminarTurno = r; }));
        const { result } = montar(enviar);
        act(() => result.current.abrir());
        await avanzar(20 + VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 10);
        act(() => ReconocimientoFalso.ultimo.decir('¿qué ceno?', true));
        await avanzar(silencioParaTerminar('¿qué ceno?') + 10);
        act(() => result.current.hablar('Te propongo algo ligero. Por ejemplo una ensalada con atún.'));
        await avanzar(1);
        expect(result.current.estado).toBe('hablando');
        act(() => result.current.tocar());
        expect(sintesisFalsa.cancel).toHaveBeenCalled();
        expect(result.current.estado).toBe('pensando');
        act(() => result.current.hablar('Esto ya no se dice.'));
        expect(habladas).not.toContain('Esto ya no se dice.');
        await act(async () => { terminarTurno(); });
        await avanzar(VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS + 20);
        expect(result.current.estado).toBe('escuchando');
    });
});

// ── la pantalla ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('ModoVoz', () => {
    it('dice de quién es el turno y sus botones mandan', () => {
        const onTocar = vi.fn();
        const onCerrar = vi.fn();
        const { rerender } = render(
            <ModoVoz estado="escuchando" oido="me comí un mangú" dicho="" onTocar={onTocar} onCerrar={onCerrar} />,
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Te escucho…')).toBeInTheDocument();
        expect(screen.getByText('me comí un mangú')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Terminar de hablar' }));
        expect(onTocar).toHaveBeenCalled();

        rerender(<ModoVoz estado="hablando" oido="me comí un mangú" dicho="Listo, lo anoté." onTocar={onTocar} onCerrar={onCerrar} />);
        expect(screen.getByText('Listo, lo anoté.')).toBeInTheDocument();
        expect(screen.getByText('Toca el círculo para interrumpir')).toBeInTheDocument();

        rerender(<ModoVoz estado="pausa" oido="" dicho="" onTocar={onTocar} onCerrar={onCerrar} />);
        expect(screen.getByText('Cuéntame qué comiste o pregúntame lo que quieras')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCerrar).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Terminar' }));
        expect(onCerrar).toHaveBeenCalledTimes(2);
    });
});

// ── el chat ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe('AgentPage: el modo voz enchufado', () => {
    const ap = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');

    it('solo en modo seguimiento, con la caja vacía y donde el dispositivo oye y habla', () => {
        expect(ap).toContain('{vozCoach.disponible && enModoContador && !input.trim() && attachments.length === 0 && (');
        expect(ap).toContain("const ModoVoz = lazy(() => import('../components/agent/ModoVoz'));");
    });

    it('el modo voz es el Modo Llamada: manda is_call_mode y dice las frases del stream', () => {
        expect(ap).toContain('const isCallModeActive = vozCoach.abierto;');
        expect(ap).toContain('is_call_mode: !!callModeRef.current');
        expect(ap).toMatch(/const queueTTS = useCallback\(\(text\) => \{\s*hablarModoVoz\(text\);/);
        expect(ap).not.toContain('const processTTSQueue');
    });
});
