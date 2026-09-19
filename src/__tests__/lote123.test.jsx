// [P1-PLAN-LOTE-123 · 2026-09-19] El dueño: «le mandé la foto… estuvo bien por unos segundos pero luego la imagen cambió
// de tamaño y volvió a su tamaño normal, pero el scroll se había ido hacia arriba en ese corto lapso».
//
// LA CADENA. Al terminar la subida (~7 s) la burbuja cambia la foto local por la del servidor y su `id` cambia → la clave
// de React cambia → la foto se REMONTA vacía → la caja (cuyo alto lo ponía la imagen) baja de 260 a 96 px y vuelve →
// el navegador recorta `scrollTop` al encoger → si la foto vuelve a crecer antes de que se despache ese evento de
// scroll, la distancia al fondo ya es de 164 px > 120 → el chat se declara en modo LIBRE y nadie re-ancla.
// Se corta en cuatro sitios: caja de tamaño propio, clave estable, relevo sin hueco y guardia en el manejador.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChatImage } from '../components/agent/ChatImage';
import {
    decidirAlAlejarseDelFondo, hayIntencionDeScroll, INTENCION_VIGENTE_MS, LAYOUT_RECIENTE_MS,
} from '../utils/chatScrollIntent';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(), API_BASE: '' }));
vi.mock('../config/platform', () => ({ isNativeApp: () => false }));

const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('¿subió el usuario o cambió el alto?', () => {
    const T = 1_000_000;
    it('cerca del fondo no hay nada que decidir', () => {
        expect(decidirAlAlejarseDelFondo({ distancia: 120, ahora: T })).toBe('nada');
    });
    it('lejos del fondo SIN gesto y pegado a un cambio de alto: es el layout → se re-ancla', () => {
        expect(decidirAlAlejarseDelFondo({ distancia: 164, ultimoCambioDeAltoEn: T - 16, ahora: T })).toBe('fijar');
        expect(decidirAlAlejarseDelFondo({ distancia: 164, ultimoCambioDeAltoEn: T - LAYOUT_RECIENTE_MS + 1, ahora: T })).toBe('fijar');
    });
    it('con el dedo puesto, o un gesto reciente (inercia), es el usuario → libre, aunque el alto esté cambiando', () => {
        expect(decidirAlAlejarseDelFondo({ distancia: 300, tocando: true, ultimoCambioDeAltoEn: T - 5, ahora: T })).toBe('libre');
        expect(decidirAlAlejarseDelFondo({ distancia: 300, ultimoGestoEn: T - 900, ultimoCambioDeAltoEn: T - 5, ahora: T })).toBe('libre');
    });
    it('sin gesto y sin cambio de alto reciente (un salto programado): libre, como siempre', () => {
        expect(decidirAlAlejarseDelFondo({ distancia: 300, ultimoCambioDeAltoEn: T - 5000, ahora: T })).toBe('libre');
        expect(decidirAlAlejarseDelFondo({ distancia: 300, ahora: T })).toBe('libre');
    });
    it('la intención caduca', () => {
        expect(hayIntencionDeScroll({ ultimoGestoEn: T - INTENCION_VIGENTE_MS + 1, ahora: T })).toBe(true);
        expect(hayIntencionDeScroll({ ultimoGestoEn: T - INTENCION_VIGENTE_MS - 1, ahora: T })).toBe(false);
        expect(hayIntencionDeScroll({ ahora: T })).toBe(false);
    });
});

describe('ChatImage: relevo sin hueco', () => {
    let precargas;
    const ImageReal = globalThis.Image;
    beforeEach(() => {
        precargas = [];
        globalThis.Image = class { constructor() { precargas.push(this); } set src(v) { this._src = v; } get src() { return this._src; } };
    });
    afterEach(() => { globalThis.Image = ImageReal; });

    it('con una foto ya pintada, la nueva se precarga y solo entonces la sustituye', () => {
        const { container, rerender } = render(<ChatImage url="data:image/png;base64,AAA" alt="foto" />);
        const img = () => container.querySelector('img');
        expect(img().getAttribute('src')).toBe('data:image/png;base64,AAA');
        fireEvent.load(img()); // la local ya se vio
        rerender(<ChatImage url="https://cdn.ejemplo/foto.jpg" alt="foto" />);
        expect(img().getAttribute('src')).toBe('data:image/png;base64,AAA'); // sigue la vieja: ni hueco ni salto
        expect(precargas.at(-1).src).toBe('https://cdn.ejemplo/foto.jpg');
        act(() => { precargas.at(-1).onload(); });
        expect(img().getAttribute('src')).toBe('https://cdn.ejemplo/foto.jpg');
    });

    it('la primera carga va directa, sin precarga', () => {
        const { container } = render(<ChatImage url="https://cdn.ejemplo/a.jpg" alt="foto" />);
        expect(container.querySelector('img').getAttribute('src')).toBe('https://cdn.ejemplo/a.jpg');
        expect(precargas.length).toBe(0);
    });
});

describe('los contratos', () => {
    it('la caja de la foto tiene tamaño PROPIO: la imagen no opina', () => {
        const css = leer('components/agent/MessageBubble.css');
        const i = css.indexOf('.message-media-button {');
        const caja = css.slice(i, css.indexOf('}', i));
        expect(caja).toMatch(/aspect-ratio:\s*16 \/ 13;/);
        expect(caja).toMatch(/position:\s*relative;/);
        const j = css.indexOf('.message-media-button > img,');
        const img = css.slice(j, css.indexOf('}', j));
        expect(img).toMatch(/position:\s*absolute;/);
        expect(img).toMatch(/inset:\s*0;/);
        expect(img).not.toMatch(/max-height/);
        expect(css).toContain('.message-media-button > .message-media-loading {');
    });

    it('la clave de la foto no cambia entre la versión local y la del servidor, y el visor conserva la completa', () => {
        const chat = leer('pages/AgentPage.jsx');
        expect((chat.match(/clientKey: item\.id,/g) || []).length).toBe(2);
        expect(chat).toContain('fullUrl: item.image_url || item.url || item.thumbDataUrl,');
        expect(leer('components/agent/MessageBubble.jsx'))
            .toContain('const key = attachment.clientKey || attachment.id || attachment.attachment_id ||');
    });

    it('el manejador de scroll consulta la regla y re-ancla; la salida a modo libre sigue donde estaba', () => {
        const chat = leer('pages/AgentPage.jsx');
        expect(chat).toContain("if (alejarse === 'fijar') _pinBottomInstant();");
        expect(chat).toContain("else if (distanceFromBottom > 120) _setMode('free');");
        expect(chat).toContain('ultimoCambioDeAltoRef.current = Date.now();');
        expect(chat).toContain("el.addEventListener('touchstart', baja, pasivo);");
        expect(chat).toContain("el.addEventListener('wheel', marca, pasivo);");
    });
});
