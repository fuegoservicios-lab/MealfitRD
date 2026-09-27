// [P1-PLAN-LOTE-410 · 2026-09-27] Dos pedidos del dueño en el escáner:
//
//  1. «Ese botón "Listo" ¿no lo ves innecesario? ¿No sería mejor en automático?»: en el panel de comida y día de un
//     plato, tocar una opción la aplica Y cierra el panel. Sin «Listo».
//  2. «Cuando le doy scroll para arriba no se cierre tan fácil, se me sale sin querer»: la hoja «tomaba el relevo» del
//     scroll — subía el contenido, llegaba arriba con el dedo aún bajando y ESE MISMO gesto la cerraba con 70 px o un
//     flick. Ahora un gesto que empezó como scroll nunca cierra la hoja (hay que empezar a deslizar estando arriba) y
//     cerrar pide más: 110 px, o un flick con al menos 40 px recorridos.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useBottomSheet } from '../hooks/useBottomSheet';

const salida = {};
const onClose = vi.fn();
const montar = () => {
    const cont = document.createElement('div');
    const cuerpo = document.createElement('div');
    cont.appendChild(cuerpo);
    document.body.appendChild(cont);
    const { result } = renderHook(() => useBottomSheet({ containerRef: { current: cont }, bodyRef: { current: cuerpo }, onClose }));
    Object.assign(salida, { hoja: result.current, cuerpo });
};
const toque = (y, t) => ({ touches: [{ clientY: y }], timeStamp: t });

beforeEach(() => {
    vi.useFakeTimers();
    onClose.mockReset();
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    montar();
});

describe('[410] deslizar para cerrar no se cuela en el scroll', () => {
    it('un scroll hacia arriba que llega al tope con el dedo aún bajando NO cierra la hoja', () => {
        salida.cuerpo.scrollTop = 300;
        salida.hoja.onTouchStart(toque(200, 0));
        salida.hoja.onTouchMove(toque(230, 16));          // el scroll lleva el gesto
        salida.cuerpo.scrollTop = 0;                     // …el contenido llega arriba
        for (let i = 1; i <= 10; i += 1) salida.hoja.onTouchMove(toque(230 + i * 20, 16 + i * 16));   // y el dedo sigue 200 px
        salida.hoja.onTouchEnd();
        vi.advanceTimersByTime(300);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('desde arriba: 80 px no cierran; 130 px sí', () => {
        salida.cuerpo.scrollTop = 0;
        salida.hoja.onTouchStart(toque(100, 0));
        for (let i = 1; i <= 8; i += 1) salida.hoja.onTouchMove(toque(100 + i * 11, i * 40));   // lento, 88 px
        salida.hoja.onTouchEnd();
        vi.advanceTimersByTime(300);
        expect(onClose).not.toHaveBeenCalled();

        salida.hoja.onTouchStart(toque(100, 1000));
        for (let i = 1; i <= 10; i += 1) salida.hoja.onTouchMove(toque(100 + i * 14, 1000 + i * 40));   // lento, 140 px
        salida.hoja.onTouchEnd();
        vi.advanceTimersByTime(300);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('un flick corto (menos de 40 px) no cierra', () => {
        salida.cuerpo.scrollTop = 0;
        salida.hoja.onTouchStart(toque(100, 0));
        salida.hoja.onTouchMove(toque(112, 10));
        salida.hoja.onTouchMove(toque(135, 20));          // rápido, pero 35 px − 8
        salida.hoja.onTouchEnd();
        vi.advanceTimersByTime(300);
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('[410] el panel de comida y día se cierra solo', () => {
    it('sin «Listo»: cada opción aplica y cierra', () => {
        const src = readFileSync(resolve(__dirname, '..', 'components/dashboard/ScanMealModal.jsx'), 'utf8');
        expect(src).not.toContain("{t('Listo')}");
        expect(src).toContain('onChange={(v) => { onDestino({ mealType: v, daysAgo: destino.daysAgo }); onCerrar(); }}');
        expect(src).toContain('onChange={(v) => { onDestino({ mealType: destino.mealType, daysAgo: v }); onCerrar(); }}');
    });
});
