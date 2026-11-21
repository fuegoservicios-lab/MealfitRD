/**
 * [P1-PLAN-LOTE-1132 · 2026-11-20] Segunda pasada del mapa de niveles: el plan de mejora + las ideas del 1131.
 *
 *  1. Mundos: cada semana vive en el rango que tenías al empezarla; la que cruza un umbral abre una «puerta».
 *  2. Celebración: hoy (o ayer) en meta, una vez por día; un mundo recién abierto; nunca lluvia de cosas viejas.
 *  3. El componente: «Hoy» al pie del día de hoy, copy de la PRIMERA estrella, pastillas del marcador que explican,
 *     «Ir a hoy» al alejarse, la celebración en pantalla y «Compartir mi camino».
 *  4. Compartir el camino: el resumen (últimos 14 niveles, mundo, sin kcal) y su texto de respaldo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { armarMapa, filasDelMapa, celebracionPendiente } from '../utils/mapaDeNiveles';
import MapaDeNiveles, { CLAVE_CELEBRADAS } from '../components/dashboard/MapaDeNiveles';
import { resumenDeMapa, textoDeMapa, NIVELES_EN_LA_HISTORIA } from '../utils/compartirMapa';

vi.mock('../utils/mobileHaptics', () => ({ triggerMobileHaptic: vi.fn() }));

const HOY = '2026-11-20';                     // viernes; Semana 1 = 8-14, Semana 2 = 15-21
const UMBRALES = [0, 2, 25];                  // umbrales de prueba: con 2 estrellas se abre el 2.º mundo
const todoEnMeta = (iso) => (iso <= HOY ? 'green' : null);

describe('mundos', () => {
    it('la semana que cruza el umbral abre el mundo siguiente; la de después ya vive en él', () => {
        const m = armarMapa({ inicioISO: '2026-11-08', hoyISO: HOY, estadoDe: todoEnMeta, umbrales: UMBRALES });
        const [actual, primera] = m.semanas;
        expect(primera).toMatchObject({ estrellas: 3, mundo: 0, abreMundo: 1 });
        expect(actual).toMatchObject({ mundo: 1, abreMundo: null });
        expect(m.mundo).toBe(1);
        const { filas, zonas, alto } = filasDelMapa(m.semanas);
        const puertas = filas.filter((f) => f.tipo === 'puerta');
        expect(puertas).toHaveLength(1);
        expect(puertas[0].mundo).toBe(1);
        // la puerta va justo encima del trofeo de la semana que la abrió
        const iPuerta = filas.indexOf(puertas[0]);
        expect(filas[iPuerta + 1]).toMatchObject({ tipo: 'trofeo', semana: primera });
        expect(filas.at(-1).tipo).toBe('inicio');
        // dos paisajes: el de arriba hasta el borde, el de abajo hasta el pie
        expect(zonas.map((z) => z.mundo)).toEqual([1, 0]);
        expect(zonas[0].y0).toBe(0);
        expect(zonas.at(-1).y1).toBe(alto);
    });

    it('sin umbrales (o sin estrellas) no hay puertas: un solo mundo con su inicio', () => {
        const m = armarMapa({ inicioISO: '2026-11-08', hoyISO: HOY, estadoDe: () => null });
        const { filas, zonas } = filasDelMapa(m.semanas);
        expect(filas.some((f) => f.tipo === 'puerta')).toBe(false);
        expect(zonas).toHaveLength(1);
    });
});

describe('celebración', () => {
    const conEstados = (e) => armarMapa({ inicioISO: '2026-11-08', hoyISO: HOY, estadoDe: (iso) => e[iso] || null });

    it('hoy en meta se celebra una vez; ya vista, no vuelve', () => {
        const m = conEstados({ '2026-11-20': 'green' });
        const c = celebracionPendiente(m, new Set());
        expect(c).toMatchObject({ tipo: 'dia', iso: HOY, esHoy: true, clave: `dia:${HOY}` });
        expect(celebracionPendiente(m, new Set([`dia:${HOY}`]))).toBeNull();
    });

    it('si hoy aún no, ayer cerrado en meta; y avisa si ese día dio la estrella (3.er día en meta)', () => {
        const m = conEstados({ '2026-11-17': 'green', '2026-11-18': 'green', '2026-11-19': 'green' });
        expect(celebracionPendiente(m, [])).toMatchObject({ tipo: 'dia', iso: '2026-11-19', esHoy: false, estrella: true });
        const sinEstrella = conEstados({ '2026-11-19': 'green' });
        expect(celebracionPendiente(sinEstrella, [])).toMatchObject({ estrella: false });
    });

    it('lo viejo no se celebra (meses de historia al abrir por primera vez)', () => {
        const m = conEstados({ '2026-11-10': 'green', '2026-11-11': 'green' });
        expect(celebracionPendiente(m, [])).toBeNull();
    });

    it('un mundo recién abierto va primero', () => {
        const m = armarMapa({ inicioISO: '2026-11-08', hoyISO: HOY, estadoDe: todoEnMeta, umbrales: UMBRALES });
        expect(celebracionPendiente(m, [])).toMatchObject({ tipo: 'mundo', mundo: 1, clave: 'mundo:1' });
        expect(celebracionPendiente(m, ['mundo:1'])).toMatchObject({ tipo: 'dia', iso: HOY });
    });
});

describe('el componente', () => {
    beforeEach(() => { try { window.localStorage.clear(); } catch { /* jsdom */ } });
    const pintar = (estados, extra = {}) => render(
        <MapaDeNiveles inicioISO="2026-11-08" hoyISO={HOY} selected={HOY}
            estadoDe={(iso) => estados[iso] || null} porFecha={new Map()} onElegir={vi.fn()} {...extra} />,
    );

    it('el día de hoy dice «Hoy» al pie y la semana sin estrellas habla de la PRIMERA', () => {
        pintar({ '2026-11-16': 'green' });
        expect(screen.getByText('Hoy')).toBeInTheDocument();
        expect(screen.getByText('Faltan 2 días en meta para tu primera estrella')).toBeInTheDocument();
    });

    it('con estrellas ya ganadas, la semana en curso habla de OTRA estrella', () => {
        pintar({ '2026-11-15': 'green', '2026-11-16': 'green', '2026-11-17': 'green' });
        expect(screen.getByText('Faltan 2 días en meta para otra estrella')).toBeInTheDocument();
    });

    it('cada pastilla del marcador explica lo que cuenta (y se cierra al volver a tocarla)', () => {
        pintar({});
        const racha = screen.getByTitle('Racha');
        fireEvent.click(racha);
        expect(racha).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('status')).toHaveTextContent('Días seguidos en meta');
        fireEvent.click(screen.getByTitle('Estrellas'));
        expect(screen.getByRole('status')).toHaveTextContent('hasta 3 estrellas');
        fireEvent.click(screen.getByTitle('Estrellas'));
        expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('al cerrar hoy en meta sale la celebración, se anota y no se repite', () => {
        const { unmount } = pintar({ [HOY]: 'green' });
        expect(screen.getByText('¡Nivel superado!')).toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(CLAVE_CELEBRADAS))).toContain(`dia:${HOY}`);
        unmount();
        pintar({ [HOY]: 'green' });
        expect(screen.queryByText('¡Nivel superado!')).toBeNull();
    });

    it('la celebración se va sola', () => {
        vi.useFakeTimers();
        try {
            pintar({ [HOY]: 'green' });
            expect(screen.getByText('¡Nivel superado!')).toBeInTheDocument();
            act(() => { vi.advanceTimersByTime(4000); });
            expect(screen.queryByText('¡Nivel superado!')).toBeNull();
        } finally { vi.useRealTimers(); }
    });

    it('«Ir a hoy» aparece al alejarse y vuelve a hoy', () => {
        const onElegir = vi.fn();
        const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 1; });
        try {
            render(<MapaDeNiveles inicioISO="2026-11-08" hoyISO={HOY} selected="2026-11-08" estadoDe={() => null} porFecha={new Map()} onElegir={onElegir} />);
            const ventana = screen.getByTestId('mapa-de-niveles').querySelector('[class*="ventana"]:not([class*="ventanaMarco"])');
            Object.defineProperty(ventana, 'clientHeight', { value: 300, configurable: true });
            ventana.scrollTop = 2000;
            fireEvent.scroll(ventana);
            fireEvent.click(screen.getByRole('button', { name: 'Ir a hoy' }));
            expect(onElegir).toHaveBeenCalledWith(HOY);
        } finally { raf.mockRestore(); }
    });

    it('«Compartir mi camino» entrega lo que el mapa pinta (de lo viejo a hoy, sin lo que viene)', () => {
        const onCompartir = vi.fn();
        pintar({ '2026-11-19': 'green' }, { onCompartir });
        fireEvent.click(screen.getByRole('button', { name: 'Compartir mi camino' }));
        const arg = onCompartir.mock.calls[0][0];
        expect(arg).toMatchObject({ nivelHoy: 13, mundo: 'bronce' });
        expect(arg.dias[0].iso).toBe('2026-11-08');
        expect(arg.dias.at(-1)).toMatchObject({ iso: HOY, esHoy: true });
        expect(arg.dias.some((d) => d.estado === 'futuro')).toBe(false);
    });
});

describe('compartir el camino', () => {
    const dias = Array.from({ length: 20 }, (_, i) => ({ iso: `2026-11-${String(i + 1).padStart(2, '0')}`, estado: i % 3 ? 'meta' : 'bajo', esHoy: i === 19 }));

    it('se queda con los últimos 14 niveles, el mundo y el día; sin kcal', () => {
        const r = resumenDeMapa({ nivelHoy: 67, estrellas: 12, racha: 4, mundo: 'plata', dias });
        expect(r.dias).toHaveLength(NIVELES_EN_LA_HISTORIA);
        expect(r.dias.at(-1)).toMatchObject({ iso: '2026-11-20', esHoy: true });
        expect(r).toMatchObject({ tipo: 'mapa', nivel: 67, estrellas: 12, racha: 4, mundo: { clave: 'plata', nombre: 'Plata' } });
        expect(r.periodo).toBe('Día 67 · Mundo Plata');
        expect(typeof r.pintor.pintar).toBe('function');
        expect(JSON.stringify(r)).not.toMatch(/kcal/);
    });

    it('el texto de respaldo lleva el camino en dos filas y el mundo', () => {
        const txt = textoDeMapa(resumenDeMapa({ nivelHoy: 67, estrellas: 12, racha: 4, mundo: 'plata', dias }));
        expect(txt).toContain('Día 67');
        expect(txt).toContain('Mundo Plata');
        expect(txt).toContain('12 estrellas');
        expect(txt.split('\n').filter((l) => /^[✅🟡🟠⚪]+$/u.test(l))).toHaveLength(2);
    });

    it('un mundo desconocido cae en Bronce', () => {
        expect(resumenDeMapa({ mundo: 'xx', dias: [] }).mundo.clave).toBe('bronce');
    });
});

describe('[1135] el mapa en grande', () => {
    it('el botón de la izquierda lo abre a pantalla completa; Escape lo devuelve y avisa al cajón', () => {
        const onGrande = vi.fn();
        render(<MapaDeNiveles inicioISO="2026-11-08" hoyISO={HOY} selected={HOY} estadoDe={() => null} porFecha={new Map()} onElegir={vi.fn()} onGrande={onGrande} />);
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Ver el mapa en grande' }));
        expect(screen.getByRole('dialog', { name: 'Mapa de niveles' })).toContainElement(screen.getByTestId('mapa-de-niveles'));
        expect(onGrande).toHaveBeenLastCalledWith(true);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(onGrande).toHaveBeenLastCalledWith(false);
        expect(screen.getByTestId('mapa-de-niveles')).toBeInTheDocument();
    });
});
