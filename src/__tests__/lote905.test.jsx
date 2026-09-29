/**
 * [P1-PLAN-LOTE-905 · 2026-09-29] Modo voz con GPT-Live-1 (prueba del dueño): el teléfono habla con OpenAI por WebRTC;
 * el SDP pasa por nuestro servidor, que corre el coach de siempre cuando GPT-Live-1 delega. WebRTC y el micrófono son
 * FALSOS aquí: se prueba el contrato (cuándo está disponible, qué se manda, cómo se ven los eventos, qué se aplica).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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
        const ultima = red.pedidas.filter((p) => p.url.includes('/novedades')).at(-1);
        await act(async () => { vi.advanceTimersByTime(LIVE_SONDEO_MS + 10); await Promise.resolve(); });
        expect(red.pedidas.filter((p) => p.url.includes('/novedades')).at(-1).url).toContain('desde=1');
        expect(ultima.url).toContain('desde=0');
    });

    it('cerrar pide el cierre a OpenAI y suelta el micrófono', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { result } = await abierto();
        const canal = CanalFalso.ultimo;
        act(() => result.current.cerrar());
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
});

describe('cableado en AgentPage', () => {
    it('con la prueba habilitada el modo voz es el de GPT-Live-1; si no, el de siempre', () => {
        const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        expect(src).toContain('const vozCoach = vozEnVivo.disponible ? vozEnVivo : vozDelTelefono;');
        expect(src).toContain('fetchSessionMessagesRef.current?.(currentSessionIdRef.current)');
    });
});
