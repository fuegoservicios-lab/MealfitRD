// [P1-PLAN-LOTE-122 · 2026-09-19] El visor de fotos del chat. El dueño: «mejora cuando entro a la foto, la X está fuera
// del rango». La X se montaba sobre la esquina de la foto (el relleno superior era el MAYOR de 3.5rem y la zona segura,
// no la suma), el fondo azul translúcido convertía las bandas negras de una captura en una caja flotante, y el visor
// no se cerraba deslizando hacia abajo como cualquier visor de fotos del teléfono.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoizedMessageBubble } from '../components/agent/MessageBubble';
import {
    ejeDelGesto, decidirGestoVisor, arrastreDelVisor, VISOR_CERRAR_PX, VISOR_PASAR_PX,
} from '../utils/imageViewerGesture';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(), API_BASE: '' }));

const css = readFileSync(join(__dirname, '..', 'components/agent/MessageBubble.css'), 'utf8').replace(/\r\n/g, '\n');
const regla = (selector) => {
    const i = css.indexOf(`${selector} {`);
    expect(i, `no existe la regla ${selector}`).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
};

const FOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pintar = (n = 1) => render(
    <MemoizedMessageBubble
        msg={{ role: 'user', content: '', isImage: true, attachments: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, url: FOTO })) }}
        index={0}
        currentSessionId="s"
        onRegenerate={() => {}}
    />,
);
const abrir = () => {
    const mini = document.querySelector('.message-media-grid button') || document.querySelector('.message-media-grid img');
    fireEvent.click(mini);
    return document.querySelector('.message-image-viewer');
};
const deslizar = (el, { dx = 0, dy = 0 }) => {
    fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 200 + dx / 2, clientY: 300 + dy / 2 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
};

// jsdom crea todos los eventos en el mismo instante: sin reloj, cualquier roce sale con velocidad infinita.
let reloj = 0;
beforeEach(() => {
    document.body.innerHTML = '';
    reloj = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (reloj += 100));
});

describe('decisiones puras del gesto', () => {
    it('el eje se decide al pasar de 10 px y gana el mayor recorrido', () => {
        expect(ejeDelGesto({ dx: 4, dy: 6 })).toBeNull();
        expect(ejeDelGesto({ dx: 5, dy: 40 })).toBe('vertical');
        expect(ejeDelGesto({ dx: -40, dy: 12 })).toBe('horizontal');
    });
    it('hacia abajo cierra (recorrido o golpe rápido); hacia arriba, no', () => {
        expect(decidirGestoVisor({ eje: 'vertical', dy: VISOR_CERRAR_PX + 1 })).toBe('cerrar');
        expect(decidirGestoVisor({ eje: 'vertical', dy: 45, vy: 0.9 })).toBe('cerrar');
        expect(decidirGestoVisor({ eje: 'vertical', dy: 60, vy: 0.1 })).toBe('nada');
        expect(decidirGestoVisor({ eje: 'vertical', dy: -200 })).toBe('nada');
    });
    it('horizontal pasa de foto solo si hay varias', () => {
        expect(decidirGestoVisor({ eje: 'horizontal', dx: VISOR_PASAR_PX, varias: true })).toBe('anterior');
        expect(decidirGestoVisor({ eje: 'horizontal', dx: -VISOR_PASAR_PX, varias: true })).toBe('siguiente');
        expect(decidirGestoVisor({ eje: 'horizontal', dx: -200, varias: false })).toBe('nada');
    });
    it('con la página ampliada (pellizco) el dedo mueve la foto: no hay gestos', () => {
        expect(decidirGestoVisor({ eje: 'vertical', dy: 300, zoom: 2 })).toBe('nada');
        expect(decidirGestoVisor({ eje: 'horizontal', dx: 300, zoom: 1.5, varias: true })).toBe('nada');
    });
    it('el arrastre solo baja y el fondo nunca se apaga del todo', () => {
        expect(arrastreDelVisor(-50)).toEqual({ baja: 0, opacidad: 1 });
        expect(arrastreDelVisor(210).baja).toBe(210);
        expect(arrastreDelVisor(210).opacidad).toBeCloseTo(0.5, 5);
        expect(arrastreDelVisor(5000).opacidad).toBe(0.35);
    });
});

describe('el visor', () => {
    it('deslizar hacia abajo lo cierra; un roce no', () => {
        pintar();
        let visor = abrir();
        expect(visor).toBeTruthy();
        deslizar(visor, { dy: 40 });
        expect(document.querySelector('.message-image-viewer')).toBeTruthy();
        deslizar(visor, { dy: 180 });
        expect(document.querySelector('.message-image-viewer')).toBeNull();
        visor = abrir();
        expect(visor).toBeTruthy();
    });

    it('mientras se arrastra, la foto sigue al dedo por variables CSS y al soltar se limpian', () => {
        pintar();
        const visor = abrir();
        fireEvent.touchStart(visor, { touches: [{ clientX: 200, clientY: 300 }] });
        fireEvent.touchMove(visor, { touches: [{ clientX: 201, clientY: 360 }] });
        expect(visor.classList.contains('arrastrando')).toBe(true);
        expect(visor.style.getPropertyValue('--visor-baja')).toBe('60px');
        fireEvent.touchEnd(visor, { changedTouches: [{ clientX: 201, clientY: 360 }] });
        expect(visor.classList.contains('arrastrando')).toBe(false);
        expect(visor.style.getPropertyValue('--visor-baja')).toBe('');
    });

    it('con varias fotos el deslizamiento horizontal pasa de foto y el contador tiene su franja', () => {
        pintar(3);
        const visor = abrir();
        expect(visor.classList.contains('con-varias')).toBe(true);
        expect(screen.getByText('1 / 3')).toBeInTheDocument();
        deslizar(visor, { dx: -120 });
        expect(screen.getByText('2 / 3')).toBeInTheDocument();
        deslizar(visor, { dx: 120 });
        expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('la X es un icono dentro de un botón con nombre', () => {
        pintar();
        abrir();
        const x = screen.getByRole('button', { name: 'Cerrar imagen' });
        expect(x.querySelector('svg')).toBeTruthy();
        expect(x.textContent.trim()).toBe('');
    });
});

describe('la geometría', () => {
    it('la X tiene SU franja: el relleno superior SUMA la zona segura (antes era el mayor de los dos)', () => {
        const v = regla('.message-image-viewer');
        expect(v).toContain('calc(env(safe-area-inset-top, 0px) + 4rem)');
        expect(v).not.toMatch(/max\(3\.5rem, env\(safe-area-inset-top/);
        const x = regla('.message-image-viewer-close');
        expect(x).toContain('top: calc(env(safe-area-inset-top, 0px) + 0.6rem);');
        expect(x).toMatch(/height:\s*44px;/); // 0.6rem + 44 px = 53,6 < 64: nunca pisa la foto
    });
    it('fondo negro opaco (las bandas de una captura desaparecen) y foto de borde a borde en el teléfono', () => {
        expect(regla('.message-image-viewer')).toContain('background: rgb(0 0 0 / var(--visor-opacidad, 1));');
        expect(regla('.message-image-viewer > img')).toMatch(/border-radius:\s*0;/);
        expect(regla('.message-image-viewer > img')).toContain('transform: translateY(var(--visor-baja, 0px));');
        expect(regla('.message-image-viewer.arrastrando > img')).toMatch(/transition:\s*none;/);
    });
    it('sigue cabiendo ENTERA (lote 117)', () => {
        const v = regla('.message-image-viewer');
        expect(v).toContain('grid-template-rows: minmax(0, 1fr);');
        expect(v).toContain('grid-template-columns: minmax(0, 1fr);');
    });
});
