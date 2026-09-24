// [P1-COMPARTIR-DIA-PASADO · 2026-09-24] Compartir un día PASADO desde el Diario (el dueño: «¿y si yo quisiera compartir
// días pasados?»). El cajón abre la MISMA hoja que la tarjeta de hoy, con las cifras y la fecha del día que se mira.
//
//  · un día pasado con comidas: «Compartir este día», y lo que sale es ESE día (fecha y totales del servidor);
//  · hoy, desde el cajón: «Compartir mi día», como en la tarjeta; un día sin comidas no ofrece compartir;
//  · con la hoja abierta, Escape la cierra a ella y no al cajón, y las flechas no cambian el día que hay debajo;
//  · mientras carga otro día el botón se queda pero apagado: nunca junta las cifras de un día con la fecha de otro.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import DiaryHistory from '../components/dashboard/DiaryHistory';
import { fetchWithAuth } from '../config/api';
import { fechaLarga } from '../utils/compartirDia';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));
vi.mock('../utils/confirmToast', () => ({ confirmToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
// Sin canvas en jsdom: la hoja cae al texto, que es lo que se comprueba (fecha y cifras).
vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => null) }));
// framer-motion sin animaciones: lo que se prueba es qué se pinta, no cómo entra
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

const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });
const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const _h = new Date();
const HOY = aISO(_h);
const AYER_FECHA = new Date(_h.getFullYear(), _h.getMonth(), _h.getDate() - 1, 12);
const AYER = aISO(AYER_FECHA);

// El día de la captura del dueño (miércoles 23): 1825 de 2050 kcal, P 113/134, C 161/251, G 78/57.
const comida = (id, meal_name, meal_type, calories, protein, carbs, healthy_fats) => ({
    id, meal_name, meal_type, calories, protein, carbs, healthy_fats,
    consumed_at: AYER_FECHA.toISOString(), created_at: AYER_FECHA.toISOString(), micros: null,
});
const DIA_AYER = {
    meals: [
        comida('a1', '2 panecillos con queso, jamón de pavo y aderezo', 'desayuno', 510, 24, 50, 22),
        comida('a2', 'Plátano maduro hervido con pollo al horno y ensalada', 'almuerzo', 695, 49, 75, 20),
        comida('a3', 'Tortilla de 4 huevos con queso y ensalada de garbanzos con maíz (estimado)', 'cena', 620, 40, 36, 36),
    ],
    totals: { calories: 1825, protein: 113, carbs: 161, healthy_fats: 78, micros: null, micros_coverage: { con_datos: 0, total: 3 } },
};
const DIA_VACIO = { meals: [], totals: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0, micros: null, micros_coverage: { con_datos: 0, total: 0 } } };

/** `porFecha[iso]`: el cuerpo del día, o `'colgada'` para una petición que no termina. Lo demás, vacío. */
const enrutar = (porFecha) => vi.fn(async (url) => {
    const u = String(url);
    if (u.startsWith('/api/diary/consumed-range/')) {
        return respuesta({ days: Object.entries(porFecha).filter(([, d]) => d?.meals?.length).map(([date, d]) => ({ date, calories: d.totals.calories, meals_count: d.meals.length })) });
    }
    if (u.startsWith('/api/diary/consumed/')) {
        const fecha = new URLSearchParams(u.split('?')[1]).get('date');
        if (porFecha[fecha] === 'colgada') return new Promise(() => {});
        return respuesta(porFecha[fecha] || DIA_VACIO);
    }
    return respuesta({});
});

const abrir = (onClose = () => {}) => render(
    <DiaryHistory userId="u1" open onClose={onClose} targetCalories={2050} targetMacros={{ protein: 134, carbs: 251, fats: 57 }} targetMicros={null} />
);
const irAAyer = async () => {
    const tiras = await screen.findAllByRole('tab');
    fireEvent.click(tiras[tiras.length - 2]);
    await screen.findByText('2 panecillos con queso, jamón de pavo y aderezo');
};
const textoCompartido = () => decodeURIComponent(screen.getByRole('link', { name: /whatsapp/i }).getAttribute('href'));

beforeEach(() => {
    fetchWithAuth.mockReset();
});

describe('[P1-COMPARTIR-DIA-PASADO] compartir desde el Diario', () => {
    it('un día pasado se comparte con SU fecha y SUS totales', async () => {
        fetchWithAuth.mockImplementation(enrutar({ [AYER]: DIA_AYER }));
        abrir();
        // hoy, en blanco: no hay nada que compartir
        await screen.findByText('El día está en blanco. Cuéntale al coach lo que comas y lo va anotando aquí.');
        expect(screen.queryByRole('button', { name: 'Compartir mi día' })).toBeNull();

        await irAAyer();
        const boton = await screen.findByRole('button', { name: 'Compartir este día' });
        await waitFor(() => expect(boton).not.toBeDisabled());
        fireEvent.click(boton);

        const hoja = await screen.findByRole('dialog', { name: 'Compartir tu día' });
        expect(within(hoja).getByText(fechaLarga(AYER_FECHA))).toBeInTheDocument();
        const texto = textoCompartido();
        expect(texto).toContain(fechaLarga(AYER_FECHA));
        expect(texto).not.toContain(fechaLarga(new Date()));
        expect(texto).toMatch(/1[.,\s]?825 \/ 2[.,\s]?050 kcal/);
        expect(texto).toMatch(/113 \/ 134 g/);
        expect(texto).toMatch(/78 \/ 57 g/);
        // privacidad por defecto, como en la tarjeta: los nombres solo si se pide
        expect(texto).not.toContain('panecillos');
        fireEvent.click(within(hoja).getByRole('checkbox', { name: /incluir lo que comí/i }));
        await waitFor(() => expect(textoCompartido()).toContain('2 panecillos con queso, jamón de pavo y aderezo'));
    });

    it('hoy, desde el cajón, dice «Compartir mi día»; un día sin comidas no ofrece compartir', async () => {
        fetchWithAuth.mockImplementation(enrutar({ [HOY]: DIA_AYER }));
        abrir();
        const boton = await screen.findByRole('button', { name: 'Compartir mi día' });
        await waitFor(() => expect(boton).not.toBeDisabled());
        fireEvent.click(boton);
        const hoja = await screen.findByRole('dialog', { name: 'Compartir tu día' });
        expect(textoCompartido()).toContain(fechaLarga(new Date()));
        fireEvent.click(within(hoja).getByRole('button', { name: 'Cerrar' }));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Compartir tu día' })).toBeNull());

        // ayer, sin registro: el botón desaparece
        const tiras = screen.getAllByRole('tab');
        fireEvent.click(tiras[tiras.length - 2]);
        await waitFor(() => expect(screen.queryByRole('button', { name: /^Compartir (mi|este) día$/ })).toBeNull());
    });

    it('con la hoja abierta, Escape la cierra a ella y no al cajón; las flechas no mueven el día', async () => {
        fetchWithAuth.mockImplementation(enrutar({ [AYER]: DIA_AYER }));
        const cerrarCajon = vi.fn();
        abrir(cerrarCajon);
        await irAAyer();
        const boton = await screen.findByRole('button', { name: 'Compartir este día' });
        await waitFor(() => expect(boton).not.toBeDisabled());
        fireEvent.click(boton);
        await screen.findByRole('dialog', { name: 'Compartir tu día' });

        const tiras = screen.getAllByRole('tab');
        fireEvent.keyDown(document, { key: 'ArrowLeft' });
        expect(tiras[tiras.length - 2].getAttribute('aria-selected')).toBe('true');

        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Compartir tu día' })).toBeNull());
        expect(cerrarCajon).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Diario de días anteriores' })).toBeInTheDocument();

        // cerrada la hoja, las teclas vuelven a ser del cajón
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(cerrarCajon).toHaveBeenCalledTimes(1);
    });

    it('el cajón carga la hoja bajo demanda y NO importa `compartirDia.js`: el día viaja crudo y lo adapta la hoja', () => {
        // Importarlo aquí lo mete entero en el trozo del panel (DashboardTracking), que el precache del apex descarga
        // siempre: +1,5 kB gz lo dejaba en 30,8 kB, por encima del techo de 30 de scripts/precache-guard.mjs.
        const dh = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'dashboard', 'DiaryHistory.jsx'), 'utf8');
        expect(dh).toContain("const ShareDaySheet = lazy(() => import('./ShareDaySheet'));");
        expect(dh).not.toMatch(/from ['"][./]*utils\/(compartirDia|tarjetaDelDia)['"]/);
        expect(dh).toContain('diario={aCompartir.dia}');
    });

    it('mientras carga otro día, el botón se queda apagado: no junta las cifras de un día con la fecha de otro', async () => {
        fetchWithAuth.mockImplementation(enrutar({ [HOY]: DIA_AYER, [AYER]: 'colgada' }));
        abrir();
        const hoy = await screen.findByRole('button', { name: 'Compartir mi día' });
        await waitFor(() => expect(hoy).not.toBeDisabled());

        const tiras = screen.getAllByRole('tab');
        fireEvent.click(tiras[tiras.length - 2]);
        const boton = await screen.findByRole('button', { name: 'Compartir este día' });
        expect(boton).toBeDisabled();
        fireEvent.click(boton);
        expect(screen.queryByRole('dialog', { name: 'Compartir tu día' })).toBeNull();
    });
});
