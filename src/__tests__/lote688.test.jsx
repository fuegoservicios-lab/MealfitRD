/**
 * [P1-PLAN-LOTE-688] Moverse por la app con el modo voz activo. El dueño: «quiero que se pueda mover dentro de la app
 * mientras el modo voz esté activo: si le digo que me comí 2 huevos con pan integral y me pregunta cuántas lonjas,
 * cuando lo agregue lo pueda ver en directo cómo sube el contador».
 *  · El modo voz se minimiza a una burbuja (no es un diálogo: la app sigue usable) y se vuelve a expandir.
 *  · El chat sigue montado al cambiar de pestaña; lo escrito no sale mientras la voz está activa.
 *  · Progreso refresca al acabar cada turno del coach y el número SUBE a la vista.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ModoVoz from '../components/agent/ModoVoz';
import { NUMERO_ANIMADO_MS, NUMERO_ANIMADO_TRAS_CARGA_MS, useNumeroAnimado } from '../hooks/useNumeroAnimado';

const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('ModoVoz minimizado: una burbuja, no un diálogo', () => {
    const base = { estado: 'escuchando', oido: '', dicho: '', pulso: 0 };

    it('pinta la burbuja con su círculo, expandir y terminar; no bloquea la app', () => {
        const onTocar = vi.fn(); const onCerrar = vi.fn(); const onExpandir = vi.fn();
        render(<ModoVoz {...base} oido="me comí dos huevos" minimizado onTocar={onTocar} onCerrar={onCerrar} onExpandir={onExpandir} />);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('region', { name: 'Modo voz' })).toBeTruthy();
        expect(document.body.style.overflow).not.toBe('hidden');
        expect(screen.getByText('me comí dos huevos')).toBeTruthy();       // el bocadillo: lo que va diciendo
        fireEvent.click(screen.getByRole('button', { name: 'Terminar de hablar' }));
        fireEvent.click(screen.getByRole('button', { name: 'Abrir el modo voz' }));
        fireEvent.click(screen.getByRole('button', { name: 'Terminar el modo voz' }));
        expect(onTocar).toHaveBeenCalledTimes(1);
        expect(onExpandir).toHaveBeenCalledTimes(1);
        expect(onCerrar).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCerrar).toHaveBeenCalledTimes(1);                          // Escape no cierra una burbuja
    });

    it('la primera vez el bocadillo explica que se puede mover, hasta que hay algo que decir', () => {
        const pistaBurbuja = 'Puedes moverte por la app mientras hablamos';
        const { rerender } = render(<ModoVoz {...base} minimizado pistaBurbuja={pistaBurbuja} onTocar={vi.fn()} onCerrar={vi.fn()} />);
        expect(screen.getByText(pistaBurbuja)).toBeTruthy();
        rerender(<ModoVoz {...base} oido="me comí dos huevos" minimizado pistaBurbuja={pistaBurbuja} onTocar={vi.fn()} onCerrar={vi.fn()} />);
        expect(screen.queryByText(pistaBurbuja)).toBeNull();
        expect(screen.getByText('me comí dos huevos')).toBeTruthy();
    });

    it('el bocadillo dice lo que dice el coach mientras habla, o el error', () => {
        const { rerender } = render(<ModoVoz {...base} estado="hablando" dicho="¿Cuántas lonjas de pan?" minimizado onTocar={vi.fn()} onCerrar={vi.fn()} />);
        expect(screen.getByText('¿Cuántas lonjas de pan?')).toBeTruthy();
        rerender(<ModoVoz {...base} estado="error" error="No hubo respuesta. Toca el círculo para intentarlo de nuevo" minimizado onTocar={vi.fn()} onCerrar={vi.fn()} />);
        expect(screen.getByText(/No hubo respuesta/)).toBeTruthy();
    });

    it('en la pestaña del coach sube por encima de la caja de escribir', () => {
        const { container, rerender } = render(<ModoVoz {...base} minimizado enChat onTocar={vi.fn()} onCerrar={vi.fn()} />);
        expect(document.body.querySelector('[data-en-chat]').getAttribute('data-en-chat')).toBe('1');
        rerender(<ModoVoz {...base} minimizado onTocar={vi.fn()} onCerrar={vi.fn()} />);
        expect(document.body.querySelector('[data-en-chat]').getAttribute('data-en-chat')).toBe('0');
        expect(container).toBeTruthy();
    });

    it('expandido sigue siendo el diálogo de siempre, ahora con «minimizar»', () => {
        const onMinimizar = vi.fn();
        render(<ModoVoz {...base} onTocar={vi.fn()} onCerrar={vi.fn()} onMinimizar={onMinimizar} />);
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(document.body.style.overflow).toBe('hidden');
        fireEvent.click(screen.getByRole('button', { name: 'Minimizar el modo voz' }));
        expect(onMinimizar).toHaveBeenCalledTimes(1);
    });

    it('la burbuja va encima de la barra de pestañas y debajo de los modales', () => {
        const css = leer('components/agent/ModoVoz.module.css');
        expect(css).toMatch(/\.burbuja \{[\s\S]*?z-index: var\(--z-widget\);/);
        expect(css).toMatch(/bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 96px - var\(--tabbar-recupera, 0px\)\)/);
        expect(css).toContain(".burbuja[data-en-chat='1']");
    });
});

describe('useNumeroAnimado: el contador sube a la vista', () => {
    let reducir = false;
    beforeEach(() => {
        reducir = false;
        vi.useFakeTimers();
        window.matchMedia = vi.fn(() => ({ matches: reducir, addEventListener() {}, removeEventListener() {} }));
    });
    afterEach(() => { vi.useRealTimers(); });

    it('en la carga inicial y al bajar, el valor se ve en el mismo render', () => {
        const { result, rerender } = renderHook(({ v }) => useNumeroAnimado(v), { initialProps: { v: 0 } });
        rerender({ v: 1470 });
        expect(result.current).toBe(1470);                               // abrir Progreso no «se llena» despacio
        act(() => { vi.advanceTimersByTime(NUMERO_ANIMADO_TRAS_CARGA_MS + 50); });
        rerender({ v: 1080 });
        expect(result.current).toBe(1080);                               // deshacer baja de inmediato
    });

    it('pasada la carga, una subida cuenta desde el valor anterior hasta el nuevo', () => {
        const { result, rerender } = renderHook(({ v }) => useNumeroAnimado(v), { initialProps: { v: 1080 } });
        act(() => { vi.advanceTimersByTime(NUMERO_ANIMADO_TRAS_CARGA_MS + 50); });
        rerender({ v: 1470 });
        expect(result.current).toBe(1080);                               // el nuevo aún no se pinta de golpe
        act(() => { vi.advanceTimersByTime(NUMERO_ANIMADO_MS * 0.4); });
        expect(result.current).toBeGreaterThan(1080);
        expect(result.current).toBeLessThan(1470);
        act(() => { vi.advanceTimersByTime(NUMERO_ANIMADO_MS); });
        expect(result.current).toBe(1470);
    });

    it('con «reducir movimiento» no anima nunca', () => {
        reducir = true;
        const { result, rerender } = renderHook(({ v }) => useNumeroAnimado(v), { initialProps: { v: 100 } });
        act(() => { vi.advanceTimersByTime(NUMERO_ANIMADO_TRAS_CARGA_MS + 50); });
        rerender({ v: 400 });
        expect(result.current).toBe(400);
    });
});

describe('cableado', () => {
    it('Progreso refresca al acabar cada turno del coach y anima el número consumido', () => {
        const tp = leer('components/dashboard/TrackingProgress.jsx');
        expect(tp).toContain("window.addEventListener('mealfit:chat-turn-done', onAgentRefreshInventory);");
        expect(tp).toContain("window.removeEventListener('mealfit:chat-turn-done', onAgentRefreshInventory);");
        expect(tp).toContain('const consumed = useNumeroAnimado(consumedReal);');
        expect(tp).toContain('{formatNumber(consumed)}');
    });

    it('el chat minimiza la voz, la sube en su pestaña y no deja salir lo escrito mientras está activa', () => {
        const ap = leer('pages/AgentPage.jsx');
        // abre MINIMIZADO («que se minimice de primeras para que el usuario sepa que se puede hacer»)
        expect(ap).toContain('const [vozMinimizada, setVozMinimizada] = useState(true);');
        const abrir = ap.slice(ap.indexOf('const abrirModoVoz = () => {'), ap.indexOf('const cerrarModoVoz = () => {'));
        expect(abrir).toContain('setVozMinimizada(true);');
        expect(abrir).toContain('safeLocalStorageGet(CLAVE_BURBUJA_EXPLICADA, null)');
        expect(ap).toContain("pistaBurbuja={pistaDeLaBurbuja ? t('Puedes moverte por la app mientras hablamos') : ''}");
        expect(ap).toContain('minimizado={vozMinimizada}');
        expect(ap).toContain('enChat={isAgentRouteActive}');
        expect(ap).toContain('readOnly={isCallModeActive}');
        expect(ap).toContain("if (typeof overrideInput !== 'string' && callModeRef.current) return;");
        // el guard nuevo va DESPUÉS del de entrada (test_p1_chat_stop_power lo busca en los primeros 1.800 caracteres)
        const hs = ap.indexOf('const handleSend = async');
        const entrada = ap.indexOf('|| isTurnActiveRef.current) return;', hs);
        const voz = ap.indexOf("if (typeof overrideInput !== 'string' && callModeRef.current) return;", hs);
        expect(entrada - hs).toBeLessThan(1800);
        expect(voz).toBeGreaterThan(entrada);
    });
});
