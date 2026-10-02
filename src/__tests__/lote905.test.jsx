/**
 * [P1-PLAN-LOTE-905 · 2026-09-29] Modo voz con GPT-Live-1 (prueba del dueño): el teléfono habla con OpenAI por WebRTC;
 * el SDP pasa por nuestro servidor, que corre el coach de siempre cuando GPT-Live-1 delega. WebRTC y el micrófono son
 * FALSOS aquí: se prueba el contrato (cuándo está disponible, qué se manda, cómo se ven los eventos, qué se aplica).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const red = vi.hoisted(() => ({ respuestas: {}, pedidas: [] }));
vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(async (url, opts = {}) => {
        red.pedidas.push({ url, opts });
        const clave = Object.keys(red.respuestas).find((k) => url.startsWith(k));
        const r = clave ? red.respuestas[clave] : { status: 404, body: {} };
        const cuerpo = typeof r.body === 'function' ? r.body() : r.body;
        return { ok: r.status < 300, status: r.status, json: async () => cuerpo };
    }),
}));

import { useConversacionLive, LIVE_SONDEO_MS } from '../hooks/useConversacionLive';
import { sonarModoVoz } from '../utils/sonidosModoVoz';
import WaterTracker from '../components/dashboard/WaterTracker';
import { aplicarCambiosDeVoz } from '../utils/cambiosDeVoz';
vi.mock('../utils/sonidosModoVoz', () => ({ sonarModoVoz: vi.fn(), DURACION_SONIDO_VOZ_MS: 160 }));

class CanalFalso {
    constructor() { this.readyState = 'open'; this.enviados = []; this.onmessage = null; CanalFalso.ultimo = this; }
    send(t) { this.enviados.push(JSON.parse(t)); }
    close() { this.readyState = 'closed'; }
    emitir(ev) { this.onmessage?.({ data: JSON.stringify(ev) }); }
}
class PeerFalso {
    constructor() { this.cerrado = false; this.pistas = []; PeerFalso.ultimo = this; }
    addTrack(t) { this.pistas.push(t); }
    createDataChannel(nombre) { this.canal = nombre; return new CanalFalso(); }
    async createOffer() { return { type: 'offer', sdp: 'OFERTA' }; }
    async setLocalDescription() {}
    async setRemoteDescription(d) { this.remota = d; }
    close() { this.cerrado = true; }
}
const pista = { stop: vi.fn() };

beforeEach(() => {
    localStorage.clear();
    sonarModoVoz.mockClear();
    pista.stop.mockClear();
    red.respuestas = {
        '/api/chat/live/disponible': { status: 200, body: { disponible: true } },
        '/api/chat/live/sesion': { status: 200, body: { live_id: 'live_1', sdp: 'RESPUESTA' } },
        '/api/chat/live/live_1/novedades': { status: 200, body: { novedades: [], cerrada: false } },
    };
    red.pedidas = [];
    window.RTCPeerConnection = PeerFalso;
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [pista] })) },
    });
});
afterEach(() => { delete window.RTCPeerConnection; vi.useRealTimers(); });

async function abierto(opts = {}) {
    const hook = renderHook(() => useConversacionLive({ sessionId: 'chat-1', locale: 'es-DO', ...opts }));
    await waitFor(() => expect(hook.result.current.disponible).toBe(true));
    await act(async () => { await hook.result.current.abrir(); });
    return hook;
}

describe('useConversacionLive', () => {
    it('sin habilitar en el servidor no está disponible (y el modo voz de siempre sigue)', async () => {
        red.respuestas['/api/chat/live/disponible'] = { status: 200, body: { disponible: false } };
        const { result } = renderHook(() => useConversacionLive({ sessionId: 'chat-1' }));
        await act(async () => { await Promise.resolve(); });
        expect(result.current.disponible).toBe(false);
        await act(async () => { await result.current.abrir(); });
        expect(red.pedidas.some((p) => p.url === '/api/chat/live/sesion')).toBe(false);
        expect(sonarModoVoz).not.toHaveBeenCalled();
    });

    it.each(['microfono', 'webrtc'])('sin API de %s ofrece el modo del teléfono sin abrir una sesión', async (api) => {
        if (api === 'microfono') Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
        else delete window.RTCPeerConnection;
        const { result } = renderHook(() => useConversacionLive());
        await waitFor(() => expect(red.pedidas.some(p => p.url === '/api/chat/diagnostico-voz')).toBe(true));
        expect(result.current.disponible).toBe(false);
        await act(async () => { await result.current.abrir(); });
        expect(red.pedidas.some(p => p.url === '/api/chat/live/sesion')).toBe(false);
        expect(sonarModoVoz).not.toHaveBeenCalled();
    });

    it('un fallo inmediato de captura cierra el estado, conserva el motor Live y registra solo el código', async () => {
        navigator.mediaDevices.getUserMedia.mockRejectedValue(new TypeError('secret-token-and-private-text'));
        const alError = vi.fn();
        const { result } = await abierto({ alError });
        expect(result.current.estado).toBe('error');
        expect(result.current.abierto).toBe(false);
        expect(alError).toHaveBeenCalledWith(expect.objectContaining({ fase: 'microfono' }));
        expect(result.current.disponible).toBe(true);
        expect(red.pedidas.some(p => p.url === '/api/chat/live/sesion')).toBe(false);
        const diagnostico = red.pedidas.find(p => p.url === '/api/chat/diagnostico-voz');
        expect(JSON.parse(diagnostico.opts.body)).toMatchObject({ codigo: 'live_microfono_TypeError', donde: 'modo_voz' });
        expect(diagnostico.opts.body).not.toContain('secret-token-and-private-text');
        expect(sonarModoVoz.mock.calls).toEqual([['abrir'], ['cerrar']]);
    });

    it('si falla WebRTC suelta la captura antes de volver a intentar el mismo motor', async () => {
        window.RTCPeerConnection = class { constructor() { throw new DOMException('unsupported', 'NotSupportedError'); } };
        const alError = vi.fn();
        const { result } = await abierto({ alError });
        expect(pista.stop).toHaveBeenCalledTimes(1);
        expect(result.current.abierto).toBe(false);
        expect(alError).toHaveBeenCalledWith(expect.objectContaining({ fase: 'webrtc' }));
        expect(result.current.disponible).toBe(true);
        expect(red.pedidas.some(p => p.url === '/api/chat/live/sesion')).toBe(false);
    });

    it.each(['NotAllowedError', 'SecurityError'])('un permiso denegado (%s) no se esquiva con el respaldo', async (name) => {
        navigator.mediaDevices.getUserMedia.mockRejectedValue(new DOMException('denied', name));
        const alError = vi.fn();
        const { result } = await abierto({ alError });
        expect(result.current.abierto).toBe(false);
        expect(result.current.error).toBe('Permite el micrófono para dictar');
        expect(alError).toHaveBeenCalledWith(expect.objectContaining({ mensaje: 'Permite el micrófono para dictar' }));
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('abrir: micrófono → oferta por NUESTRO servidor → respuesta de OpenAI; canal oai-events', async () => {
        const { result } = await abierto();
        const envio = red.pedidas.find((p) => p.url === '/api/chat/live/sesion');
        const cuerpo = JSON.parse(envio.opts.body);
        expect(cuerpo.sdp).toBe('OFERTA');
        expect(cuerpo.session_id).toBe('chat-1');
        expect(PeerFalso.ultimo.canal).toBe('oai-events');
        expect(PeerFalso.ultimo.remota).toEqual({ type: 'answer', sdp: 'RESPUESTA' });
        expect(result.current.estado).toBe('escuchando');
        expect(result.current.abierto).toBe(true);
        expect(sonarModoVoz.mock.calls).toEqual([['abrir']]);
        expect(pista.enabled).toBe(true);
    });

    it('el sonido no deja iOS en playback al capturar: evita el InvalidStateError real de WebKit', async () => {
        Object.defineProperty(navigator, 'audioSession', { configurable: true, value: { type: 'auto' } });
        sonarModoVoz.mockImplementationOnce(() => { navigator.audioSession.type = 'playback'; });
        navigator.mediaDevices.getUserMedia.mockImplementation(async () => {
            if (!['auto', 'play-and-record'].includes(navigator.audioSession.type)) {
                throw new DOMException('AudioSession category is not compatible with audio capture.', 'InvalidStateError');
            }
            return { getTracks: () => [pista] };
        });
        const alError = vi.fn();
        try {
            const { result } = await abierto({ alError });
            expect(navigator.audioSession.type).toBe('play-and-record');
            expect(result.current.estado).toBe('escuchando');
            expect(alError).not.toHaveBeenCalled();
            expect(red.pedidas.some(p => p.url === '/api/chat/live/sesion')).toBe(true);
            act(() => result.current.cerrar());
        } finally { delete navigator.audioSession; }
    });

    it('los eventos de la sesión mueven el círculo: oye, piensa (delega), habla', async () => {
        const { result } = await abierto();
        act(() => CanalFalso.ultimo.emitir({ type: 'session.input_transcript.delta', delta: 'me comí ' }));
        act(() => CanalFalso.ultimo.emitir({ type: 'session.input_transcript.delta', delta: 'un mangú' }));
        expect(result.current.oido).toBe('me comí un mangú');
        act(() => CanalFalso.ultimo.emitir({ type: 'session.delegation.created', delegation: { id: 'd1' } }));
        expect(result.current.estado).toBe('pensando');
        act(() => CanalFalso.ultimo.emitir({ type: 'session.output_transcript.delta', delta: 'Listo, anotado.' }));
        expect(result.current.estado).toBe('hablando');
        expect(result.current.dicho).toBe('Listo, anotado.');
        expect(result.current.oido).toBe('');
    });

    it('lo que el coach hizo llega por las novedades y se aplica una vez', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const alNovedad = vi.fn();
        red.respuestas['/api/chat/live/live_1/novedades'] = {
            status: 200, body: { novedades: [{ n: 1, oido: 'activa la hidratación', ajustes_de_app: { hidratacion: true } }], cerrada: false },
        };
        await abierto({ alNovedad });
        await act(async () => { vi.advanceTimersByTime(LIVE_SONDEO_MS + 10); await Promise.resolve(); await Promise.resolve(); });
        expect(alNovedad).toHaveBeenCalledWith(expect.objectContaining({ ajustes_de_app: { hidratacion: true } }));
        await act(async () => { vi.advanceTimersByTime(LIVE_SONDEO_MS + 10); await Promise.resolve(); });
        expect(red.pedidas.filter((p) => p.url.includes('/novedades')).at(-1).url).toContain('desde=1');
        expect(red.pedidas.find((p) => p.url.includes('/novedades')).url).toContain('desde=0');
        expect(alNovedad).toHaveBeenCalledTimes(1);
    });

    it('el agua confirmada por voz se ve en la tarjeta sin recargar ni esperar otro sondeo', async () => {
        let entregar;
        let vasos = 0;
        red.respuestas['/api/plans/water-intake'] = {
            status: 200, body: () => ({ glasses: vasos, goal: 8, enabled: true }),
        };
        red.respuestas['/api/chat/live/live_1/novedades'] = {
            status: 200, body: () => new Promise((r) => { entregar = r; }),
        };
        render(<WaterTracker userId="u-duenio" />);
        await screen.findByText('0 / 8');
        await abierto({ alNovedad: aplicarCambiosDeVoz });
        expect(red.pedidas.some((p) => p.url.includes('esperar_s=20'))).toBe(true);
        vasos = 1; // La herramienta ya escribió el vaso en el servidor.
        await act(async () => { entregar({ novedades: [{ n: 1, agua: true, diario: true, turno_completo: false }], cerrada: false }); });
        expect(screen.getByText('1 / 8')).toBeInTheDocument();
        const agua = red.pedidas.filter((p) => p.url.startsWith('/api/plans/water-intake'));
        expect(agua.every((p) => !p.opts.method || p.opts.method === 'GET')).toBe(true);
    });

    it('el modo habitual refresca el agua incluso si el LLM no devuelve etiquetas UI_ACTION', async () => {
        let vasos = 0;
        red.respuestas['/api/plans/water-intake'] = {
            status: 200, body: () => ({ glasses: vasos, goal: 8, enabled: true }),
        };
        render(<WaterTracker userId="u-duenio" />);
        await screen.findByText('0 / 8');
        vasos = 0.5;
        await act(async () => { window.dispatchEvent(new CustomEvent('mealfit:chat-turn-done')); });
        expect(screen.getByText(/0[.,]5 \/ 8/)).toBeInTheDocument();
    });

    it('una respuesta pendiente después de soltar la sesión no aplica cambios', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let entregar;
        red.respuestas['/api/chat/live/live_1/novedades'] = {
            status: 200, body: () => new Promise((r) => { entregar = r; }),
        };
        const alNovedad = vi.fn();
        const { result } = await abierto({ alNovedad });
        const signal = red.pedidas.find(p => p.url.includes('/novedades')).opts.signal;
        act(() => result.current.cerrar());
        await act(async () => { vi.advanceTimersByTime(1600); });
        expect(signal.aborted).toBe(true);
        await act(async () => { entregar({ novedades: [{ n: 1, agua: true }] }); });
        expect(alNovedad).not.toHaveBeenCalled();
    });

    it('un GET antiguo no borra el vaso que acaba de registrarse por voz', async () => {
        let entregarAnterior;
        let llamadas = 0;
        red.respuestas['/api/plans/water-intake'] = {
            status: 200, body: () => llamadas++ === 0
                ? new Promise((r) => { entregarAnterior = r; })
                : { glasses: 1, goal: 8, enabled: true },
        };
        render(<WaterTracker userId="u-duenio" />);
        await waitFor(() => expect(entregarAnterior).toBeTypeOf('function'));
        await act(async () => { window.dispatchEvent(new CustomEvent('mealfit:chat-turn-done')); });
        expect(screen.getByText('1 / 8')).toBeInTheDocument();
        await act(async () => { entregarAnterior({ glasses: 0, goal: 8, enabled: true }); });
        expect(screen.getByText('1 / 8')).toBeInTheDocument();
    });

    it('cerrar pide el cierre a OpenAI y suelta el micrófono', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { result } = await abierto();
        const canal = CanalFalso.ultimo;
        act(() => result.current.cerrar());
        expect(pista.stop).toHaveBeenCalled();
        expect(pista.stop.mock.invocationCallOrder[0]).toBeLessThan(sonarModoVoz.mock.invocationCallOrder.at(-1));
        act(() => result.current.cerrar());
        expect(sonarModoVoz.mock.calls).toEqual([['abrir'], ['cerrar']]);
        expect(canal.enviados).toContainEqual({ type: 'session.close' });
        expect(result.current.estado).toBe('cerrado');
        await act(async () => { vi.advanceTimersByTime(1600); });
        expect(pista.stop).toHaveBeenCalled();
        expect(PeerFalso.ultimo.cerrado).toBe(true);
    });

    it('sin saldo el servidor dice presupuesto: error claro y deja de ofrecerse', async () => {
        red.respuestas['/api/chat/live/sesion'] = { status: 409, body: { motivo: 'presupuesto' } };
        const { result } = await abierto();
        expect(result.current.estado).toBe('error');
        expect(result.current.error).toBe('Se agotó el saldo de la prueba de voz');
        expect(result.current.disponible).toBe(false);
    });

    it('cerrar y volver a abrir no deja que el cierre anterior corte la sesión nueva', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { result } = await abierto();
        const anterior = PeerFalso.ultimo;
        act(() => result.current.cerrar());
        await act(async () => { await result.current.abrir(); });
        const nuevo = PeerFalso.ultimo;
        await act(async () => { vi.advanceTimersByTime(1600); });
        expect(anterior.cerrado).toBe(true);
        expect(nuevo.cerrado).toBe(false);
        expect(result.current.estado).toBe('escuchando');
        expect(sonarModoVoz.mock.calls).toEqual([['abrir'], ['cerrar'], ['abrir']]);
    });

    it('cerrar mientras se pide el micrófono suelta el permiso tardío sin abrir la sesión', async () => {
        let resolver;
        navigator.mediaDevices.getUserMedia.mockImplementation(() => new Promise((r) => { resolver = r; }));
        const { result } = renderHook(() => useConversacionLive({ sessionId: 'chat-1' }));
        await waitFor(() => expect(result.current.disponible).toBe(true));
        let apertura;
        act(() => { apertura = result.current.abrir(); });
        act(() => result.current.cerrar());
        await act(async () => { resolver({ getTracks: () => [pista] }); await apertura; });
        expect(pista.stop).toHaveBeenCalled();
        expect(result.current.estado).toBe('cerrado');
        expect(red.pedidas.some((p) => p.url === '/api/chat/live/sesion')).toBe(false);
        expect(sonarModoVoz.mock.calls).toEqual([['abrir'], ['cerrar']]);
    });

    it('sin permiso para la IA («Ahora no» en la hoja) lo dice, y sigue ofreciéndose', async () => {
        red.respuestas['/api/chat/live/sesion'] = { status: 428, body: { error_code: 'ai_consent_required' } };
        const alError = vi.fn();
        const { result } = await abierto({ alError });
        expect(result.current.estado).toBe('error');
        expect(result.current.abierto).toBe(false);
        expect(result.current.error).toBe('Activa la IA para usar esto');
        expect(result.current.disponible).toBe(true);
        expect(alError).toHaveBeenCalledWith(expect.objectContaining({ fase: 'servidor' }));
    });
});

describe('cableado en AgentPage', () => {
    it('con la prueba habilitada el modo voz es el de GPT-Live-1; si no, el de siempre', () => {
        const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        expect(src).toContain('const vozCoach = vozEnVivo.disponible ? vozEnVivo : vozDelTelefono;');
        expect(src).not.toContain('setUsarVozDelTelefono');
        expect(src).toContain('fetchSessionMessagesRef.current?.(currentSessionIdRef.current)');
    });
});
