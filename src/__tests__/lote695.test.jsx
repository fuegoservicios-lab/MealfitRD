// [P1-PLAN-LOTE-695 · 2026-09-28] La foto que espera sus respuestas sobrevive a salir del chat, y lo tocado en la
// tarjeta se junta con lo que se escriba después («Otra…»).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import RespuestasDeLaFoto from '../components/agent/RespuestasDeLaFoto';
import {
    VIGENCIA_FOTO_PENDIENTE_MS, borrarFotoPendiente, claveFotoPendiente, conFotoPendiente, guardarFotoPendiente,
    leerFotoPendiente, respuestaEscrita,
} from '../utils/fotoAntesDelCoach';

const DUDAS = [
    { pregunta: '¿Cuántos huevos?', opciones: [
        { texto: '1 huevo', ajuste: { calories: -72 } }, { texto: '2 huevos', supuesta: true, ajuste: {} },
    ] },
    { pregunta: '¿Verde o maduro?', opciones: [
        { texto: 'Verde', supuesta: true, ajuste: {} }, { texto: 'Maduro', ajuste: { calories: 18 } },
    ] },
];
const P = {
    sessionId: 's-1', clientMessageId: 'c-1', pie: 'Mi cena', attachments: [{ attachment_id: 'a1', url: 'https://x/a1' }],
    dudas: DUDAS, burbuja: { role: 'user', content: 'Mi cena', isImage: true, attachments: [{ id: 'a1', url: 'https://x/a1' }] },
};

beforeEach(() => { window.localStorage.clear(); });

describe('[695] la foto pendiente, guardada por chat', () => {
    it('se guarda, se lee y se borra por chat', () => {
        guardarFotoPendiente(P);
        expect(leerFotoPendiente('s-1')).toMatchObject({ clientMessageId: 'c-1', pie: 'Mi cena' });
        expect(leerFotoPendiente('otro-chat')).toBeNull();
        borrarFotoPendiente('s-1');
        expect(leerFotoPendiente('s-1')).toBeNull();
    });
    it('caduca a las 12 h (y se limpia sola)', () => {
        guardarFotoPendiente(P, 1000);
        expect(leerFotoPendiente('s-1', 1000 + VIGENCIA_FOTO_PENDIENTE_MS - 1)).not.toBeNull();
        expect(leerFotoPendiente('s-1', 1000 + VIGENCIA_FOTO_PENDIENTE_MS + 1)).toBeNull();
        expect(window.localStorage.getItem(claveFotoPendiente('s-1'))).toBeNull();
    });
    it('un registro roto no revienta: null y se borra', () => {
        window.localStorage.setItem(claveFotoPendiente('s-1'), '{no es json');
        expect(leerFotoPendiente('s-1')).toBeNull();
        window.localStorage.setItem(claveFotoPendiente('s-1'), JSON.stringify({ sessionId: 's-1', clientMessageId: 'c' }));
        expect(leerFotoPendiente('s-1')).toBeNull();   // sin dudas ni burbuja no hay tarjeta que pintar
    });
    it('al rehidratar vuelve al final si el servidor no la tiene; si la tiene, ya no está pendiente', () => {
        const servidor = [{ role: 'model', content: 'aviso de la cena' }];
        const r = conFotoPendiente(servidor, P);
        expect(r.enviada).toBe(false);
        expect(r.mensajes.at(-1)).toMatchObject({ clientMessageId: 'c-1', _esperaDudas: true, isImage: true });
        const r2 = conFotoPendiente([...servidor, { role: 'user', clientMessageId: 'c-1' }], P);
        expect(r2.enviada).toBe(true);
        expect(r2.mensajes).toHaveLength(2);
        expect(conFotoPendiente(servidor, null)).toEqual({ mensajes: servidor, enviada: false });
    });
    it('lo tocado se junta con lo escrito', () => {
        expect(respuestaEscrita('2 huevos', 'maduro')).toBe('2 huevos · maduro');
        expect(respuestaEscrita('', '4 huevos con 3 yemas')).toBe('4 huevos con 3 yemas');
    });
});

describe('[695] la tarjeta avisa de cada toque', () => {
    it('`onParcial` recibe lo elegido en cada toque, antes de completar', () => {
        const onParcial = vi.fn();
        const onEnviar = vi.fn();
        render(<RespuestasDeLaFoto dudas={DUDAS} onEnviar={onEnviar} onParcial={onParcial} />);
        fireEvent.click(screen.getByRole('button', { name: '2 huevos' }));
        expect(onParcial).toHaveBeenLastCalledWith({ 0: 1 });
        expect(onEnviar).not.toHaveBeenCalled();
    });
});

describe('[695] el chat la guarda y la devuelve', () => {
    const AP = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');
    it('se guarda con sus dudas y su burbuja con URL del servidor', () => {
        expect(AP).toContain('dudas: _dudasDelTurno,');
        expect(AP).toContain('burbuja: _burbujaDeFotoPendiente(userMsg, uploadedAttachments),');
        expect(AP).toContain("!u.startsWith('blob:')");
        expect(AP).toContain('if (v) guardarFotoPendiente(v);');
        expect(AP).toContain('else if (antes?.sessionId) borrarFotoPendiente(antes.sessionId);');
    });
    it('al abrir un chat se recupera SU foto pendiente y su tarjeta', () => {
        const i = AP.indexOf('const p = leerFotoPendiente(currentSessionId);');
        expect(i).toBeGreaterThan(-1);
        const t = AP.slice(i, i + 300);
        expect(t).toContain('setDudasDeLaFoto(p.dudas);');
        expect(t).toContain('dudasDeLaFotoSesionRef.current = currentSessionId;');
    });
    it('al rehidratar del servidor la burbuja vuelve (también en un chat que aún no tiene nada)', () => {
        expect(AP).toContain('const _conPend = conFotoPendiente(_mappedMsgs, _pend);');
        expect(AP).toContain('setMessages(_conPend.mensajes);');
        expect(AP).toContain('const _pendVacio = leerFotoPendiente(sessionId);');
    });
});

describe('[695] el reintento del turno de la foto contestada no pierde las respuestas', () => {
    const AP = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');
    it('la burbuja de error las guarda y «Reintentar» las vuelve a mandar', () => {
        expect(AP).toContain('retryRespuestasDeLaFoto: canRetry ? (respuestasDeLaFoto || undefined) : undefined,');
        expect(AP).toContain('respuestasDeLaFoto: options.respuestasDeLaFoto,   // [P1-PLAN-LOTE-695]');
        expect(AP).toContain('respuestasDeLaFoto: message.retryRespuestasDeLaFoto,   // [P1-PLAN-LOTE-695]');
    });
});

describe('[695] al volver al chat, contestar funciona aunque el historial aún no haya repuesto la foto', () => {
    const AP = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');
    it('la reanudación repone la burbuja desde la guardada y no exige verla ya en pantalla', () => {
        const i = AP.indexOf('const _reanudarFoto = (respuestas, ajuste) => {');
        const t = AP.slice(i, i + 1500);
        expect(t).toContain('if (!p || p.sessionId !== currentSessionId) return undefined;');
        expect(t).toContain('fuente = [...fuente.filter((m) => !m.isWelcome), { ...p.burbuja, clientMessageId: p.clientMessageId }];');
        expect(t).toContain('sourceMessages: fuente,');
        expect(AP).not.toContain('_fotoPendienteVigente');
    });
});
