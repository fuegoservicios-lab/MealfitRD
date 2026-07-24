/**
 * [P2-CHAT-TEXTAREA-AUTOSIZE · 2026-07-24] Tests conductuales del autosize
 * del textarea del chat.
 *
 * Bug original (reportado 2026-07-24, screenshot del input del AgentPage):
 *   "El chat del agente su tamaño se buguea a veces y se pone ancho, tengo
 *    que refrescar la página web para que vuelva a su tamaño normal."
 *
 *   Causa raíz: la altura del textarea se escribía imperativamente SOLO
 *   desde el handler `onInput` del DOM (AgentPage.jsx ~2501):
 *
 *       onInput={(e) => {
 *           e.target.style.height = 'auto';
 *           e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
 *       }}
 *
 *   React nunca es dueño de ese `height` inline (no está en el prop `style`),
 *   así que NO lo revierte en el re-render. Cualquier cambio de valor que no
 *   venga de una pulsación de tecla deja la altura vieja pegada:
 *     - enviar mensaje (`setInput('')` en handleSend),
 *     - chat nuevo (`setInput('')` en handleNewChat),
 *     - pill de sugerencia (`setInput(suggestion.text)`),
 *     - prefill desde el dashboard.
 *   Como AgentPage es keep-alive (App.jsx: se oculta con `display:none`, NO
 *   se desmonta), la altura stale sobrevivía a la navegación → solo un
 *   refresh de la página la reseteaba. Exactamente el síntoma reportado:
 *   caja inflada MOSTRANDO EL PLACEHOLDER (valor vacío).
 *
 * Fix: la altura pasa a ser función del estado (useLayoutEffect sobre el
 * valor + firma de layout) en vez de un efecto colateral del evento `input`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import {
    autosizeTextarea,
    useAutosizeTextarea,
    CHAT_TEXTAREA_MAX_HEIGHT_PX,
} from '../../utils/autosizeTextarea';

// jsdom no hace layout: `scrollHeight` es siempre 0. Lo modelamos como
// "24px por línea" para poder afirmar sobre alturas concretas. `_hidden`
// simula el caso keep-alive (`display:none` → scrollHeight 0).
const LINE_PX = 24;
let _hidden = false;
let _originalDescriptor;

beforeAll(() => {
    _originalDescriptor = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'scrollHeight',
    );
    Object.defineProperty(window.HTMLTextAreaElement.prototype, 'scrollHeight', {
        configurable: true,
        get() {
            if (_hidden) return 0;
            const lines = this.value === '' ? 1 : this.value.split('\n').length;
            return lines * LINE_PX;
        },
    });
});

afterAll(() => {
    if (_originalDescriptor) {
        Object.defineProperty(
            window.HTMLTextAreaElement.prototype,
            'scrollHeight',
            _originalDescriptor,
        );
    }
    _hidden = false;
});

// Réplica mínima del wiring del AgentPage: textarea controlado por state +
// hook. `onReady` expone el setter para simular los cambios PROGRAMÁTICOS del
// valor (enviar → `setInput('')`) — el path exacto que dejaba la altura pegada.
function ChatInputHarness({ onReady, signatureExtra = '' }) {
    const ref = useRef(null);
    const [value, setValue] = useState('');
    useAutosizeTextarea(ref, `${value}|${signatureExtra}`);
    useEffect(() => { onReady(setValue); }, [onReady]);
    return (
        <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="chat-input"
        />
    );
}

// Handle con identidad ESTABLE (es dep del effect de arriba) que captura el
// setter del harness. Función plana: no es un hook, se llama desde el test.
function makeHarnessApi() {
    const box = { set: null };
    return {
        onReady: (setValue) => { box.set = setValue; },
        setValue: (v) => box.set(v),
    };
}

describe('[P2-CHAT-TEXTAREA-AUTOSIZE] autosizeTextarea (util pura)', () => {
    it('colapsa a una línea cuando el valor está vacío', () => {
        const { getByTestId } = render(<textarea data-testid="t" defaultValue="" />);
        const el = getByTestId('t');
        el.style.height = '120px'; // altura stale de un mensaje anterior
        autosizeTextarea(el);
        expect(el.style.height).toBe(`${LINE_PX}px`);
    });

    it('crece con el contenido multilínea', () => {
        const { getByTestId } = render(<textarea data-testid="t" defaultValue={'a\nb\nc'} />);
        const el = getByTestId('t');
        autosizeTextarea(el);
        expect(el.style.height).toBe(`${3 * LINE_PX}px`);
    });

    it('topa en el máximo (scroll interno a partir de ahí)', () => {
        const many = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n');
        const { getByTestId } = render(<textarea data-testid="t" defaultValue={many} />);
        const el = getByTestId('t');
        autosizeTextarea(el);
        expect(el.style.height).toBe(`${CHAT_TEXTAREA_MAX_HEIGHT_PX}px`);
    });

    it('NO escribe altura cuando el elemento está oculto (keep-alive display:none)', () => {
        // Regresión del propio fix: medir con el AgentPage oculto devuelve
        // scrollHeight 0 → escribir `0px` dejaría el input invisible al volver.
        const { getByTestId } = render(<textarea data-testid="t" defaultValue={'a\nb'} />);
        const el = getByTestId('t');
        el.style.height = '48px';
        _hidden = true;
        try {
            autosizeTextarea(el);
        } finally {
            _hidden = false;
        }
        expect(el.style.height).toBe('48px');
    });

    it('no explota con ref nula', () => {
        expect(() => autosizeTextarea(null)).not.toThrow();
    });
});

describe('[P2-CHAT-TEXTAREA-AUTOSIZE] useAutosizeTextarea (wiring del chat)', () => {
    it('BUG REPORTADO: al limpiar el valor programáticamente (enviar) la caja vuelve a su tamaño normal', () => {
        const api = makeHarnessApi();
        const { getByTestId } = render(<ChatInputHarness onReady={api.onReady} />);
        const el = getByTestId('chat-input');

        // El usuario escribe un mensaje de 4 líneas → la caja crece.
        act(() => { api.setValue('uno\ndos\ntres\ncuatro'); });
        expect(el.style.height).toBe(`${4 * LINE_PX}px`);

        // Enviar: handleSend hace `setInput('')` — NO hay evento `input`.
        act(() => { api.setValue(''); });
        expect(el.style.height).toBe(`${LINE_PX}px`);
    });

    it('re-mide cuando cambia el ancho disponible (resize / toggle del sidebar)', () => {
        const api = makeHarnessApi();
        const { getByTestId, rerender } = render(<ChatInputHarness onReady={api.onReady} />);
        const el = getByTestId('chat-input');
        act(() => { api.setValue('uno\ndos'); });
        expect(el.style.height).toBe(`${2 * LINE_PX}px`);

        // Altura corrompida por una medición previa (o por el bug histórico):
        el.style.height = '120px';
        // Cambia la firma de layout (p.ej. showSidebar / isMobile).
        rerender(<ChatInputHarness onReady={api.onReady} signatureExtra="sidebar-off" />);
        expect(el.style.height).toBe(`${2 * LINE_PX}px`);

        // Y también ante un `resize` de la ventana.
        el.style.height = '120px';
        act(() => { window.dispatchEvent(new Event('resize')); });
        expect(el.style.height).toBe(`${2 * LINE_PX}px`);
    });

    it('limpia el listener de resize al desmontar', () => {
        const api = makeHarnessApi();
        const { getByTestId, unmount } = render(<ChatInputHarness onReady={api.onReady} />);
        const el = getByTestId('chat-input');
        act(() => { api.setValue('uno\ndos'); });
        unmount();
        el.style.height = '120px';
        act(() => { window.dispatchEvent(new Event('resize')); });
        expect(el.style.height).toBe('120px'); // nadie lo tocó tras el unmount
    });
});
