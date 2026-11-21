// [P1-PLAN-LOTE-1143 · 2026-11-21] El editor de la historia, completo (el dueño: «pantalla completa, agrandar y reducir…
// como CapCut, y algo para dar para atrás y para alante»): deshacer/rehacer por gesto, pantalla completa con zoom de
// VISTA y guías que imantan los textos.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    cargarFoto: vi.fn(async () => ({ width: 1200, height: 1600 })),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { crearHistorial, apuntar, deshacer, rehacer, puedeDeshacer, puedeRehacer, PASOS_MAX, acotarVista, vistaConZoom, pasoDeVista, VISTA_INICIAL, VISTA_MAX } from '../utils/historialDeEdicion';
import { imantarPieza, cajaDePieza } from '../utils/piezasDeHistoria';
import { piezasDeLaHistoria, PINCEL, ANCHO } from '../utils/historiaConFoto';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const R = { calorias: { valor: 2308, meta: 2050, pct: 113 }, macros: [], fecha: new Date(2026, 10, 18, 12) };

describe('[1143] historial', () => {
    it('apunta, deshace y rehace; un cambio nuevo borra lo que se podía rehacer', () => {
        const a = { estilo: 'a' }; const b = { estilo: 'b' }; const c = { estilo: 'c' };
        let h = crearHistorial(a);
        expect(puedeDeshacer(h)).toBe(false);
        h = apuntar(h, b);
        h = apuntar(h, b);                       // igual al presente: no es paso
        expect(h.pasado).toEqual([a]);
        h = deshacer(h);
        expect(h.presente).toBe(a);
        expect(puedeRehacer(h)).toBe(true);
        h = rehacer(h);
        expect(h.presente).toBe(b);
        h = deshacer(h);
        h = apuntar(h, c);
        expect(puedeRehacer(h)).toBe(false);
        expect(h.pasado).toEqual([a]);
    });

    it('guarda como mucho PASOS_MAX pasos', () => {
        let h = crearHistorial({ n: 0 });
        for (let i = 1; i <= PASOS_MAX + 10; i += 1) h = apuntar(h, { n: i });
        expect(h.pasado).toHaveLength(PASOS_MAX);
        expect(h.pasado[0].n).toBe(10);
    });
});

describe('[1143] vista', () => {
    it('al 100 % no se desplaza; agrandada, el centro no sale de la imagen', () => {
        expect(acotarVista({ zoom: 1, x: 50, y: 50 }, 300, 500)).toBe(VISTA_INICIAL);
        const v = acotarVista({ zoom: 2, x: 9999, y: -9999 }, 300, 500);
        expect(v).toEqual({ zoom: 2, x: 300, y: -500 });
        expect(acotarVista({ zoom: 99 }, 300, 500).zoom).toBe(VISTA_MAX);
    });

    it('cambiar el zoom conserva lo que se mira en el centro y la escalera sube y baja', () => {
        expect(vistaConZoom({ zoom: 2, x: 100, y: 40 }, 4, 300, 500)).toEqual({ zoom: 4, x: 200, y: 80 });
        expect(pasoDeVista(1, 1)).toBe(1.5);
        expect(pasoDeVista(1.5, 1)).toBe(2);
        expect(pasoDeVista(4, 1)).toBe(VISTA_MAX);
        expect(pasoDeVista(2, -1)).toBe(1.5);
        expect(pasoDeVista(1, -1)).toBe(1);
    });
});

describe('[1143] guías de los textos', () => {
    it('un texto cerca del centro se pega al centro y dice su línea; lejos, queda libre', () => {
        const sitio = piezasDeLaHistoria(R, 'titular').find((d) => d.id === 'sitio');
        const alCentro = ANCHO / 2 - sitio.caja.w / 2 - sitio.caja.x;
        const cerca = { sitio: { dx: alCentro + 10, dy: 0, oculta: false } };
        const im = imantarPieza(cerca, sitio, { ancho: ANCHO, margen: PINCEL.M });
        expect(im.linea).toBe(ANCHO / 2);
        const c = cajaDePieza(sitio, im.piezas);
        expect(c.x + c.w / 2).toBeCloseTo(ANCHO / 2);
        const lejos = { sitio: { dx: alCentro + 200, dy: 0, oculta: false } };
        expect(imantarPieza(lejos, sitio, { ancho: ANCHO, margen: PINCEL.M })).toEqual({ piezas: lejos, linea: null });
    });

    it('también al margen seguro de la derecha', () => {
        const sitio = piezasDeLaHistoria(R, 'titular').find((d) => d.id === 'sitio');
        const alBorde = ANCHO - PINCEL.M - sitio.caja.w - sitio.caja.x;
        const im = imantarPieza({ sitio: { dx: alBorde - 8, dy: 0 } }, sitio, { ancho: ANCHO, margen: PINCEL.M });
        expect(im.linea).toBe(ANCHO - PINCEL.M);
        expect(im.piezas.sitio.dx).toBeCloseTo(alBorde);
    });
});

describe('[1143] la hoja', () => {
    const semana = { numero: 3, enCurso: true, periodo: '16 – 22 nov', dias: [], enMeta: 4, estrellas: 9, racha: 3, rango: 'Constante' };
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
        vi.setSystemTime(new Date(2026, 10, 18, 12));
        globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
        globalThis.URL.revokeObjectURL = vi.fn();
        vi.stubGlobal('navigator', { ...navigator, share: vi.fn().mockResolvedValue(undefined), canShare: () => true, clipboard: { writeText: vi.fn() } });
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

    it('cambiar el diseño se deshace y se rehace (botones y Ctrl+Z / Ctrl+Y)', () => {
        render(<ShareDaySheet onClose={vi.fn()} semana={semana} />);
        const atras = screen.getByRole('button', { name: 'Deshacer' });
        const adelante = screen.getByRole('button', { name: 'Rehacer' });
        expect(atras).toBeDisabled();
        const radios = screen.getAllByRole('radio');
        const inicial = radios.find((r) => r.getAttribute('aria-checked') === 'true');
        const otro = radios.find((r) => r.getAttribute('aria-checked') !== 'true');
        fireEvent.click(otro);
        expect(otro).toHaveAttribute('aria-checked', 'true');
        expect(atras).not.toBeDisabled();             // aún sin apuntar, ya se puede deshacer
        fireEvent.click(atras);
        expect(inicial).toHaveAttribute('aria-checked', 'true');
        expect(adelante).not.toBeDisabled();
        fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
        expect(otro).toHaveAttribute('aria-checked', 'true');
        fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
        expect(inicial).toHaveAttribute('aria-checked', 'true');
        act(() => { vi.advanceTimersByTime(1000); });
        expect(inicial).toHaveAttribute('aria-checked', 'true');
    });

    it('pantalla completa: abre con el lienzo, el zoom de vista sube y baja, la Mano se activa y «Listo» vuelve', () => {
        render(<ShareDaySheet onClose={vi.fn()} semana={semana} />);
        fireEvent.click(screen.getByRole('button', { name: 'Pantalla completa' }));
        const editor = screen.getByRole('dialog', { name: 'Editar imagen' });
        expect(editor.querySelector('canvas')).not.toBeNull();
        expect(document.querySelectorAll('canvas')).toHaveLength(1);    // el lienzo se muda, no se duplica
        expect(screen.getByRole('button', { name: 'Ver al 100 %' })).toHaveTextContent('100 %');
        expect(screen.getByRole('button', { name: 'Alejar' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Acercar' }));
        expect(screen.getByRole('button', { name: 'Ver al 100 %' })).toHaveTextContent('150 %');
        fireEvent.click(screen.getByRole('button', { name: 'Ver al 100 %' }));
        expect(screen.getByRole('button', { name: 'Ver al 100 %' })).toHaveTextContent('100 %');
        const mano = screen.getByRole('button', { name: 'Mano: mover la vista' });
        fireEvent.click(mano);
        expect(mano).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
        expect(screen.queryByRole('dialog', { name: 'Editar imagen' })).toBeNull();
        expect(document.querySelectorAll('canvas')).toHaveLength(1);
    });

    it('ESC cierra solo el editor, no la hoja', () => {
        const onClose = vi.fn();
        render(<ShareDaySheet onClose={onClose} semana={semana} />);
        fireEvent.click(screen.getByRole('button', { name: 'Pantalla completa' }));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Editar imagen' })).toBeNull();
        expect(onClose).not.toHaveBeenCalled();
    });
});
