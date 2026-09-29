/**
 * [P1-PLAN-LOTE-906 · 2026-09-29] La burbuja del modo voz no estorba y se usa en toda la app.
 * El dueño: «que se pueda hablar incluso en configuración… y que esté en una posición cómoda que no estorbe cuando
 * esté minimizado». Fija abajo a la derecha tapaba «Ver días anteriores»; y Configuración (capa 800) la tapaba a ella.
 *  · Se arrastra y al soltarla se pega al borde más cercano, dentro de la franja entre cabecera y pestañas; se recuerda.
 *  · Un arrastre no es un toque. · Capa propia por encima de Configuración. · El globo se desvanece solo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ModoVoz from '../components/agent/ModoVoz';
import { ajustarAlBorde, BURBUJA_ABAJO, BURBUJA_ARRIBA, BURBUJA_MARGEN, CLAVE_BURBUJA_POS } from '../hooks/useBurbujaArrastrable';

const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('ajustarAlBorde', () => {
    const base = { ancho: 140, alto: 70, vw: 400, vh: 800 };
    it('se pega al borde más cercano', () => {
        expect(ajustarAlBorde({ ...base, x: 20, y: 300 }).lado).toBe('izq');
        expect(ajustarAlBorde({ ...base, x: 250, y: 300 }).lado).toBe('der');
    });
    it('no se sale de la franja entre la cabecera y la barra de pestañas', () => {
        expect(ajustarAlBorde({ ...base, x: 0, y: -50 }).y).toBe(BURBUJA_ARRIBA);
        expect(ajustarAlBorde({ ...base, x: 0, y: 5000 }).y).toBe(800 - 70 - BURBUJA_ABAJO);
        expect(ajustarAlBorde({ ...base, x: 0, y: 333.6 }).y).toBe(334);
    });
});

describe('la burbuja se arrastra', () => {
    let rect;
    beforeEach(() => {
        localStorage.clear();
        rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 250, top: 600, width: 140, height: 70, right: 390, bottom: 670, x: 250, y: 600, toJSON() {},
        });
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    });
    afterEach(() => { rect.mockRestore(); });

    const pintar = (props = {}) => render(
        <ModoVoz estado="escuchando" oido="" dicho="" minimizado onCerrar={vi.fn()} onExpandir={vi.fn()} {...props} />,
    );

    it('arrastrada a la izquierda se queda pegada a ese borde y se recuerda', () => {
        pintar();
        const region = screen.getByRole('region', { name: 'Modo voz' });
        const fila = region.querySelector('div');
        fireEvent.pointerDown(fila, { clientX: 300, clientY: 630, button: 0, pointerId: 1 });
        fireEvent.pointerMove(fila, { clientX: 60, clientY: 330, pointerId: 1 });
        expect(region.dataset.arrastrando).toBe('1');
        fireEvent.pointerUp(fila, { clientX: 60, clientY: 330, pointerId: 1 });
        expect(region.dataset.lado).toBe('izq');
        expect(region.style.left).toBe(`${BURBUJA_MARGEN}px`);
        expect(region.style.top).toBe('300px');
        expect(JSON.parse(localStorage.getItem(CLAVE_BURBUJA_POS))).toEqual({ lado: 'izq', y: 300 });
    });

    it('un arrastre no abre el modo voz (el click del final no cuenta); un toque sí', () => {
        const onExpandir = vi.fn();
        pintar({ onExpandir });
        const abrir = screen.getByRole('button', { name: 'Abrir el modo voz' });
        const fila = abrir.parentElement;
        fireEvent.pointerDown(abrir, { clientX: 300, clientY: 630, button: 0, pointerId: 1 });
        fireEvent.pointerMove(fila, { clientX: 100, clientY: 400, pointerId: 1 });
        fireEvent.pointerUp(fila, { clientX: 100, clientY: 400, pointerId: 1 });
        fireEvent.click(abrir);
        expect(onExpandir).not.toHaveBeenCalled();
        fireEvent.pointerDown(abrir, { clientX: 20, clientY: 400, button: 0, pointerId: 2 });
        fireEvent.pointerUp(abrir, { clientX: 20, clientY: 400, pointerId: 2 });
        fireEvent.click(abrir);
        expect(onExpandir).toHaveBeenCalledTimes(1);
    });

    it('vuelve donde la dejaste', () => {
        localStorage.setItem(CLAVE_BURBUJA_POS, JSON.stringify({ lado: 'der', y: 220 }));
        pintar();
        const region = screen.getByRole('region', { name: 'Modo voz' });
        expect(region.style.right).toBe(`${BURBUJA_MARGEN}px`);
        expect(region.style.top).toBe('220px');
    });

    it('el globo se desvanece solo, salvo mientras el coach habla', () => {
        const { rerender } = pintar({ pistaBurbuja: 'Puedes moverte por la app mientras hablamos' });
        expect(screen.getByText('Puedes moverte por la app mientras hablamos').dataset.fijo).toBe('0');
        rerender(<ModoVoz estado="hablando" oido="" dicho="Listo, anotado." minimizado onCerrar={vi.fn()} onExpandir={vi.fn()} />);
        expect(screen.getByText('Listo, anotado.').dataset.fijo).toBe('1');
    });
});

describe('capa y tamaño', () => {
    it('la burbuja tiene su capa, por encima de Configuración y debajo de avisos del sistema y modales', () => {
        const css = leer('index.css');
        const z = (tok) => Number(css.match(new RegExp(`${tok}:\\s*(\\d+)`))[1]);
        expect(z('--z-voz')).toBeGreaterThan(z('--z-dialog'));
        expect(z('--z-voz')).toBeLessThan(z('--z-sysbanner'));
        expect(leer('components/agent/ModoVoz.module.css')).toContain('z-index: var(--z-voz);');
    });
    it('más compacta y sin robar el desplazamiento', () => {
        const css = leer('components/agent/ModoVoz.module.css');
        expect(css).toContain('.orbe.orbeMini { width: 50px; }');
        expect(css).toContain('touch-action: none;');
        expect(css).toContain("@keyframes desvanecer");
    });
});
