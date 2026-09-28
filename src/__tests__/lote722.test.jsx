// [P1-PLAN-LOTE-722 · 2026-09-28] Pulido de la ficha del plato tras verla en el iPhone del dueño.
//
// «¿y lo de la foto? también el diseño se ve poco pulido, aparte lo de grasa fíjate como se ve la barra que está más
// arriba que las otras». Lo que se ancla:
//   1. Una comida ESCANEADA sin foto en este teléfono lo explica (antes: «Escaneada con foto» y ninguna foto); mientras
//      se mira el dispositivo (`undefined`) no hay aviso, y una comida que no era de foto nunca lo lleva.
//   2. La cabecera: franja · Hoy/Ayer/fecha corta · hora en una línea (con la fecha larga ocupaba dos).
//   3. «2 unidad de huevo hervido» se lee «2 unidades de huevo hervido» (el dato no se toca).
//   4. Macros en tres columnas con la misma estructura; «Repetir hoy» en una línea.
//   5. El cajón de días anteriores: las tres celdas de macros con nombre ARRIBA y cifra debajo sin partir, y la barra
//      al fondo — la de grasas ya no queda más arriba que las otras.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('../hooks/useFotosDeComidas', () => ({
    useFotoDeComida: vi.fn(() => null),
    useIdsConFoto: vi.fn(() => new Set()),
    borrarFotoDeComidaEnSegundoPlano: vi.fn(),
}));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: vi.fn(() => ({ planData: null })) }));

import { fetchWithAuth } from '../config/api';
import { useFotoDeComida } from '../hooks/useFotosDeComidas';
import FichaDeComida from '../components/dashboard/FichaDeComida';
import { lineaDeIngredienteLegible } from '../utils/nombresDeAlimentos';

const SRC = path.resolve(__dirname, '..');
const leer = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const UID = '11111111-1111-1111-1111-111111111111';
const hace = (dias, h = 10, m = 16) => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
};
const MEAL = {
    id: 'meal-1', meal_name: 'Huevos hervidos con aguacate', meal_type: 'desayuno',
    calories: 255, protein: 14, carbs: 7, healthy_fats: 20,
    consumed_at: hace(1), created_at: hace(1), micros: null,
};
const METAS = { calories: 2050, protein: 134, carbs: 251, fats: 57 };
const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });
const detalle = (source, lineas = [{ texto: '2 unidad de huevo hervido', kcal: 139, gramos: 100 }, { texto: '1 lasca de aguacate', kcal: 57, gramos: 35 }]) => ({
    success: true,
    meal: { id: 'meal-1', source, plan_ref: null, created_at: MEAL.created_at, ingredientes: { con_kcal: true, lineas } },
});

beforeEach(() => {
    vi.mocked(fetchWithAuth).mockReset();
    vi.mocked(useFotoDeComida).mockReturnValue(null);
});
afterEach(() => { vi.clearAllMocks(); });

describe('la foto que no está en este teléfono', () => {
    it('una comida escaneada sin foto aquí lo explica', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle('photo')));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        expect(await screen.findByText('Sin foto en este teléfono')).toBeInTheDocument();
        expect(screen.getByText(/El escáner guarda la foto solo en el teléfono donde la tomas/)).toBeInTheDocument();
        expect(screen.getByText('Escaneada con foto')).toBeInTheDocument();
    });

    it('mientras se mira el dispositivo no hay aviso (sin parpadeo antes de la foto real)', async () => {
        vi.mocked(useFotoDeComida).mockReturnValue(undefined);
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle('photo')));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        await screen.findByText('Escaneada con foto');
        expect(screen.queryByText('Sin foto en este teléfono')).not.toBeInTheDocument();
    });

    it('con la foto, la foto y no el aviso', async () => {
        vi.mocked(useFotoDeComida).mockReturnValue('blob:foto');
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle('photo')));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        await screen.findByText('Escaneada con foto');
        expect(screen.getByRole('img', { name: `Foto de ${MEAL.meal_name}` })).toBeInTheDocument();
        expect(screen.queryByText('Sin foto en este teléfono')).not.toBeInTheDocument();
    });

    it('una comida que no era de foto nunca lleva el aviso', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle('chat')));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        await screen.findByText('Anotada por el coach');
        expect(screen.queryByText('Sin foto en este teléfono')).not.toBeInTheDocument();
    });
});

describe('la cabecera en una línea', () => {
    it('franja · Ayer · hora, sin la fecha larga ni el emoji', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle('photo')));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        const cuando = document.getElementById('ficha-comida-cuando');
        expect(cuando.textContent).toMatch(/^Desayuno · Ayer · \d{1,2}:16/);
        expect(cuando.textContent).not.toMatch(/septiembre|domingo|lunes|martes|miércoles|jueves|viernes|sábado/i);
        expect(leer('components/dashboard/FichaDeComida.jsx')).not.toContain('mealEmojiFor');
    });

    it('más atrás de ayer, fecha CORTA', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle('photo')));
        render(<FichaDeComida meal={{ ...MEAL, consumed_at: hace(5), created_at: hace(5) }} userId={UID} metas={METAS} onClose={vi.fn()} />);
        const txt = document.getElementById('ficha-comida-cuando').textContent;
        expect(txt).not.toMatch(/Ayer|Hoy/);
        expect(txt.length).toBeLessThan(40);
    });

    it('la franja lleva su color (el del cajón de días anteriores)', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle('photo')));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        const franja = screen.getByText('Desayuno');
        expect(franja.getAttribute('style')).toContain('--franja: #FBBF24');
        expect(leer('components/dashboard/DiaryHistory.jsx')).toContain("{ key: 'desayuno', label: t('Desayuno'), color: '#FBBF24'");
    });
});

describe('se lee bien', () => {
    it('«2 unidad de huevo hervido» → «2 unidades de huevo hervido»; el dato no cambia', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle('photo')));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        expect(await screen.findByText('2 unidades de huevo hervido')).toBeInTheDocument();
        expect(screen.getByText('1 lasca de aguacate')).toBeInTheDocument();
    });

    it('lineaDeIngredienteLegible concuerda la unidad en español y respeta lo que no reconoce', () => {
        const t = (k) => k;
        expect(lineaDeIngredienteLegible('2 unidad de huevo hervido', t, 'es-DO')).toBe('2 unidades de huevo hervido');
        expect(lineaDeIngredienteLegible('1 taza de arroz blanco', t, 'es-DO')).toBe('1 taza de arroz blanco');
        expect(lineaDeIngredienteLegible('150 g de Pechuga de pollo', t, 'es-DO')).toBe('150 g de Pechuga de pollo');
        expect(lineaDeIngredienteLegible('2 porción de mangú', t, 'es-DO')).toBe('2 porciones de mangú');
        expect(lineaDeIngredienteLegible('un poco de sal', t, 'es-DO')).toBe('un poco de sal');
    });

    it('macros en tres columnas y «Repetir hoy»', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle('photo')));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} onEliminar={vi.fn()} />);
        for (const r of ['Proteína', 'Carbos', 'Grasas']) expect(screen.getByText(r)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Repetir hoy/ })).toBeInTheDocument();
        const css = leer('components/dashboard/FichaDeComida.module.css');
        expect(css).toMatch(/\.macros\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
        expect(css).toMatch(/\.secundario,\s*\.peligro\s*\{[^}]*white-space:\s*nowrap/);
    });
});

describe('la barra de grasas del cajón', () => {
    it('nombre arriba, cifra sin partir, barra al fondo: las tres a la misma altura', () => {
        const css = leer('components/dashboard/DiaryHistory.module.css');
        expect(css).toMatch(/\.macroCell\s*\{[^}]*flex-direction:\s*column/);
        expect(css).toMatch(/\.macroTop\s*\{[^}]*flex-direction:\s*column/);
        expect(css).toMatch(/\.macroVal\s*\{[^}]*white-space:\s*nowrap/);
        expect(css).toMatch(/\.macroBar\s*\{[^}]*margin-top:\s*auto/);
    });
});
