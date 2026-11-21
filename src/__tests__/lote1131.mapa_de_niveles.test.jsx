/**
 * [P1-PLAN-LOTE-1131 · 2026-11-20] El «Registro por día» como MAPA DE NIVELES (opción A del dueño: cada día es un nivel).
 *
 *  1. La lógica pura (`utils/mapaDeNiveles`): estados por día, semanas de domingo a sábado numeradas desde el día 1, las
 *     MISMAS estrellas del calendario (3/5/7), racha que no se rompe por un hoy sin cerrar, días que vienen bloqueados.
 *  2. El componente: un botón por día con su estado en la etiqueta, hoy con «Estás aquí», lo bloqueado no se toca y
 *     tocar un día lo elige; un trofeo por semana con sus estrellas.
 *  3. El cajón: abre en el MAPA (la principal), «Calendario» sigue a un toque y la elección se recuerda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { armarMapa, filasDelMapa, trazo, NIVELES_MAX } from '../utils/mapaDeNiveles';
import MapaDeNiveles from '../components/dashboard/MapaDeNiveles';
import DiaryHistory from '../components/dashboard/DiaryHistory';
import { fetchWithAuth } from '../config/api';
import { getBiologicalDate } from '../utils/diaBiologico';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));
vi.mock('../utils/confirmToast', () => ({ confirmToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('framer-motion', async () => {
    const React = await import('react');
    const strip = (props) => {
        const out = { ...props };
        ['initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover', 'layout'].forEach((k) => delete out[k]);
        return out;
    };
    const tag = (T) => React.forwardRef((props, ref) => React.createElement(T, { ...strip(props), ref }));
    return {
        motion: { div: tag('div'), aside: tag('aside'), span: tag('span'), button: tag('button') },
        AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
    };
});

// Viernes 20 de noviembre de 2026; el viaje empezó el domingo 8 (Semana 1 = 8-14, Semana 2 = 15-21).
const HOY = '2026-11-20';
const ESTADOS = {
    '2026-11-08': 'green', '2026-11-09': 'green', '2026-11-10': 'green', '2026-11-11': 'green', '2026-11-12': 'green',
    '2026-11-13': 'over', /* 14: sin registro */
    '2026-11-15': 'under', '2026-11-16': 'green', '2026-11-17': 'green', '2026-11-18': 'green', '2026-11-19': 'green',
    /* 20 (hoy): aún sin registro */
};
const estadoDe = (iso) => ESTADOS[iso] || null;

describe('lógica del mapa', () => {
    const mapa = armarMapa({ inicioISO: '2026-11-08', hoyISO: HOY, estadoDe });

    it('semanas de la más reciente a la más antigua, días de sábado a domingo, con su número de nivel', () => {
        expect(mapa.semanas.map((s) => s.numero)).toEqual([2, 1]);
        const [actual, primera] = mapa.semanas;
        expect(actual.dias.map((d) => d.iso)).toEqual(['2026-11-21', '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17', '2026-11-16', '2026-11-15']);
        expect(actual.dias.map((d) => d.estado)).toEqual(['futuro', 'vacio', 'meta', 'meta', 'meta', 'meta', 'bajo']);
        expect(actual.dias[1]).toMatchObject({ esHoy: true, nivel: 13 });
        expect(primera.dias.at(-1)).toMatchObject({ iso: '2026-11-08', nivel: 1, estado: 'meta' });
        expect(primera.dias[0].estado).toBe('vacio');      // sábado 14 sin registro
        expect(primera.dias[1].estado).toBe('sobre');      // viernes 13
        expect(mapa.nivelHoy).toBe(13);
    });

    it('las estrellas son las del calendario (3/5/7 días en meta) y la semana en curso dice cuánto falta', () => {
        const [actual, primera] = mapa.semanas;
        expect(primera).toMatchObject({ enMeta: 5, estrellas: 2, enCurso: false });
        expect(actual).toMatchObject({ enMeta: 4, estrellas: 1, enCurso: true, faltan: 1 });
        expect(mapa.estrellas).toBe(3);
    });

    it('la racha no se rompe porque HOY aún no llegó a la meta; un día fuera la corta', () => {
        expect(mapa.racha).toBe(4);   // 16, 17, 18, 19
        const conHoy = armarMapa({ inicioISO: '2026-11-08', hoyISO: HOY, estadoDe: (iso) => (iso === HOY ? 'green' : estadoDe(iso)) });
        expect(conHoy.racha).toBe(5);
    });

    it('el día 1 a mitad de semana: los días anteriores no son niveles; sin día 1, el camino empieza hoy', () => {
        const m = armarMapa({ inicioISO: '2026-11-11', hoyISO: HOY, estadoDe });
        expect(m.semanas[1].dias.map((d) => d.iso)).toEqual(['2026-11-14', '2026-11-13', '2026-11-12', '2026-11-11']);
        expect(m.semanas[1].dias.at(-1).nivel).toBe(1);
        const sin = armarMapa({ inicioISO: null, hoyISO: HOY, estadoDe });
        expect(sin.semanas).toHaveLength(1);
        expect(sin.nivelHoy).toBe(1);
        expect(armarMapa({ inicioISO: '2026-11-08', hoyISO: 'basura', estadoDe }).semanas).toEqual([]);
    });

    it('un viaje larguísimo se recorta al tope (el teléfono no carga miles de niveles)', () => {
        const m = armarMapa({ inicioISO: '2020-01-01', hoyISO: HOY, estadoDe: () => null });
        const total = m.semanas.reduce((n, s) => n + s.dias.length, 0);
        expect(total).toBeLessThanOrEqual(NIVELES_MAX);
    });

    it('filas y camino: un trofeo por semana encima de sus días, y un trazo continuo', () => {
        const { filas, alto } = filasDelMapa(mapa.semanas);
        expect(filas.filter((f) => f.tipo === 'trofeo')).toHaveLength(2);
        expect(filas[0].tipo).toBe('trofeo');
        expect(filas.map((f) => f.y)).toEqual([...filas.map((f) => f.y)].sort((a, b) => a - b));
        expect(alto).toBeGreaterThan(filas.at(-1).y);
        expect(trazo([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toBe('M 0 0 C 0 10, 10 10, 10 20');
        expect(trazo([])).toBe('');
    });
});

describe('el componente', () => {
    const porFecha = new Map([['2026-11-19', { date: '2026-11-19', calories: 2010, meals_count: 3 }]]);
    const pintar = (onElegir = vi.fn(), selected = HOY) => render(
        <MapaDeNiveles inicioISO="2026-11-08" hoyISO={HOY} selected={selected} estadoDe={estadoDe} porFecha={porFecha} onElegir={onElegir} />,
    );

    it('cada día es un botón con fecha, nivel y estado; hoy lleva «Estás aquí»; lo que viene está bloqueado', () => {
        const onElegir = vi.fn();
        pintar(onElegir);
        expect(screen.getByText('Estás aquí')).toBeInTheDocument();
        const jueves = screen.getByRole('button', { name: /19 de noviembre.*Día 12.*En meta.*2\D?010 kcal · 3 comida/ });
        fireEvent.click(jueves);
        expect(onElegir).toHaveBeenCalledWith('2026-11-19');
        const sabado = screen.getByRole('button', { name: /21 de noviembre.*Bloqueado/ });
        expect(sabado).toBeDisabled();
        fireEvent.click(sabado);
        expect(onElegir).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: /20 de noviembre.*Día 13.*Sin registro/ })).toHaveAttribute('aria-pressed', 'true');
    });

    it('cada semana cierra con su trofeo y sus estrellas; el marcador suma estrellas y racha', () => {
        pintar();
        expect(screen.getByRole('img', { name: 'Semana 2: 1 de 3 estrellas' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Semana 1: 2 de 3 estrellas' })).toBeInTheDocument();
        expect(screen.getByText('Día 13')).toBeInTheDocument();
        expect(screen.getByTitle('Estrellas')).toHaveTextContent('3');
        expect(screen.getByTitle('Racha')).toHaveTextContent('4');
    });
});

describe('el cajón', () => {
    const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });
    beforeEach(() => {
        try { window.localStorage.clear(); } catch { /* jsdom */ }
        fetchWithAuth.mockReset();
        fetchWithAuth.mockImplementation(async (url) => {
            if (String(url).startsWith('/api/diary/consumed-range/')) return respuesta({ days: [] });
            return respuesta({ meals: [], totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } });
        });
    });
    const abrir = () => render(<DiaryHistory userId="u1" open onClose={() => {}} targetCalories={2050} targetMacros={{}} targetMicros={null} />);

    it('abre en el MAPA; «Calendario» cambia de vista y la elección se recuerda', async () => {
        const { unmount } = abrir();
        expect(await screen.findByTestId('mapa-de-niveles')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Mapa' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('grid')).toBeNull();
        fireEvent.click(screen.getByRole('tab', { name: 'Calendario' }));
        expect(screen.getByRole('grid', { name: 'Calendario mensual' })).toBeInTheDocument();
        expect(screen.queryByTestId('mapa-de-niveles')).toBeNull();
        expect(window.localStorage.getItem('mealfit_registro_vista')).toBe('calendario');
        unmount();
        abrir();
        expect(await screen.findByRole('grid', { name: 'Calendario mensual' })).toBeInTheDocument();
    });

    it('tocar un día del mapa lo abre debajo (el mismo detalle que el calendario)', async () => {
        abrir();
        await screen.findByTestId('mapa-de-niveles');
        const hoy = getBiologicalDate(new Date());
        const hoyBtn = screen.getByRole('button', { name: new RegExp(`${hoy.getDate()} de .*Día 1`) });
        expect(hoyBtn).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Estás aquí')).toBeInTheDocument();
    });
});
