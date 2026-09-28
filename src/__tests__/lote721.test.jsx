// [P1-PLAN-LOTE-721 · 2026-09-28] La ficha de un plato registrado — la mitad del cliente.
//
// Lo que se ancla:
//   1. La fila del contador (hoy) y la del cajón de días anteriores ABREN la ficha; con foto, llevan su miniatura.
//   2. La ficha: foto «Solo en este dispositivo», de dónde vino, kcal y P/C/G contra la meta, ingredientes (con kcal
//      por renglón solo si el servidor las dio), micros o por qué no hay, y la receta si vino del plan.
//   3. «Repetir hoy» (antes «Registrar otra vez hoy») manda COORDENADAS (`source_meal_id`) y avisa a la tarjeta; «Eliminar» usa el borrado
//      de la fila y cierra la ficha solo si se borró.
//   4. El almacén de fotos: la poda (90 días / 400) y que sin IndexedDB nada revienta.
//   5. La foto nunca viaja: el almacén no llama a la red y el escáner la guarda con el `meal_id` que devolvió el alta.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));
vi.mock('../utils/confirmToast', () => ({ confirmToast: vi.fn(async () => true) }));

import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import { useFotoDeComida, useIdsConFoto, borrarFotoDeComidaEnSegundoPlano } from '../hooks/useFotosDeComidas';
import { useAssessment } from '../context/AssessmentContext';
import FichaDeComida from '../components/dashboard/FichaDeComida';
import TrackingProgress from '../components/dashboard/TrackingProgress';
import { clavesAPodar, guardarFotoDeComida, leerFotoDeComida, idsConFoto, borrarFotoDeComida, borrarFotosDelUsuario, RETENCION_DIAS, MAX_FOTOS, EVENTO_FOTOS_DE_COMIDAS } from '../utils/fotosDeComidas';

const SRC = path.resolve(__dirname, '..');
const leer = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const UID = '11111111-1111-1111-1111-111111111111';
const MEAL = {
    id: 'meal-1', meal_name: 'Arroz con fideos con pechuga y garbanzos', meal_type: 'almuerzo',
    calories: 740, protein: 42, carbs: 95, healthy_fats: 18,
    consumed_at: new Date().toISOString(), created_at: new Date().toISOString(),
    micros: null,
};
const METAS = { calories: 2000, protein: 150, carbs: 250, fats: 60 };

const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

const detalle = (extra = {}) => ({
    success: true,
    meal: {
        id: 'meal-1', source: 'photo', plan_ref: null, created_at: MEAL.created_at,
        ingredientes: { con_kcal: true, lineas: [
            { texto: '150 g de Pechuga de pollo', kcal: 161, gramos: 150 },
            { texto: '185 g de Arroz blanco', kcal: 239, gramos: 185 },
        ] },
        ...extra,
    },
});

beforeEach(() => {
    vi.mocked(fetchWithAuth).mockReset();
    vi.mocked(useFotoDeComida).mockReturnValue(null);
    vi.mocked(useIdsConFoto).mockReturnValue(new Set());
    vi.mocked(useAssessment).mockReturnValue({ planData: null });
});
afterEach(() => { vi.clearAllMocks(); });

// ─────────────────────────── la ficha ───────────────────────────

describe('FichaDeComida', () => {
    // [P1-PLAN-LOTE-762] «de dónde vino» ya no se pinta (el dueño: «que no aparezcan detalles innecesarios»)
    it('pinta la comida: cuándo, kcal contra la meta y los ingredientes con sus kcal', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle()));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: MEAL.meal_name })).toBeInTheDocument();
        // [P1-PLAN-LOTE-722] la cabecera: la franja y «Hoy · hora» en la misma línea (spans hermanos)
        const cuando = document.getElementById('ficha-comida-cuando');
        expect(cuando.textContent).toMatch(/^Almuerzo · Hoy · /);
        expect(fetchWithAuth).toHaveBeenCalledWith('/api/diary/meal/meal-1');
        expect(await screen.findByText('150 g de Pechuga de pollo')).toBeInTheDocument();
        expect(screen.queryByText('Escaneada con foto')).not.toBeInTheDocument();
        expect(screen.getByText('161 kcal')).toBeInTheDocument();
        // 740 / 2000 = 37 %
        expect(screen.getByText(/37\s?% de tu meta del día/)).toBeInTheDocument();
        // sin micros: ni sección ni nota técnica [762]
        expect(screen.queryByText(/hacen falta sus ingredientes con cantidad/)).not.toBeInTheDocument();
        expect(screen.queryByText('Micronutrientes')).not.toBeInTheDocument();
    });

    it('sin kcal por renglón (no cuadraban) pinta solo los textos', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle({
            ingredientes: { con_kcal: false, lineas: [{ texto: '8 rodajas de plátano maduro hervido' }] },
        })));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        expect(await screen.findByText('8 rodajas de plátano maduro hervido')).toBeInTheDocument();
        expect(screen.queryByText(/\d+ kcal$/, { selector: 'span' })).not.toBeInTheDocument();
    });

    it('la foto del dispositivo, sin pie de página [762]', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle()));
        vi.mocked(useFotoDeComida).mockReturnValue('blob:foto');
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        const img = screen.getByRole('img', { name: `Foto de ${MEAL.meal_name}` });
        expect(img.getAttribute('src')).toBe('blob:foto');
        expect(screen.queryByText('Solo en este dispositivo')).not.toBeInTheDocument();
        expect(useFotoDeComida).toHaveBeenCalledWith(UID, 'meal-1', 'foto');
        fireEvent.click(screen.getByRole('button', { name: 'Ver la foto en grande' }));
        expect(screen.getAllByRole('img', { name: `Foto de ${MEAL.meal_name}` })).toHaveLength(2);
    });

    it('si falla el detalle, lo dice y deja reintentar', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValueOnce(respuesta({}, false, 500))
            .mockResolvedValueOnce(respuesta(detalle()));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
        expect(await screen.findByText('150 g de Pechuga de pollo')).toBeInTheDocument();
        expect(fetchWithAuth).toHaveBeenCalledTimes(2);
    });

    it('del plan: su descripción y cómo se prepara', async () => {
        vi.mocked(useAssessment).mockReturnValue({ planData: { days: [{ meals: [{
            name: MEAL.meal_name, description: 'Un clásico de mediodía.',
            recipe: ['Mise en place: corta la pechuga.', 'Cocina el arroz con los fideos.'],
        }] }] } });
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle({ source: 'plan_meal', plan_ref: { plan_id: 'p', day_index: 0, meal_index: 0 } })));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        expect(await screen.findByText('Un clásico de mediodía.')).toBeInTheDocument();
        expect(screen.getAllByText('Del plan')).toHaveLength(1);   // [762] solo la sección: la etiqueta de origen salió
        expect(screen.getByText('Cómo se prepara')).toBeInTheDocument();
        expect(screen.getByText('Cocina el arroz con los fideos.')).toBeInTheDocument();
    });

    it('un plato escrito a mano con el mismo nombre NO trae la receta del plan', async () => {
        vi.mocked(useAssessment).mockReturnValue({ planData: { days: [{ meals: [{
            name: MEAL.meal_name, description: 'Un clásico de mediodía.', recipe: ['Paso'],
        }] }] } });
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle({ source: 'manual' })));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={vi.fn()} />);
        expect(await screen.findByText('150 g de Pechuga de pollo')).toBeInTheDocument();
        expect(screen.queryByText('Un clásico de mediodía.')).not.toBeInTheDocument();
    });

    it('«Repetir hoy» manda coordenadas, avisa a la tarjeta y cierra', async () => {
        const onClose = vi.fn();
        const oyente = vi.fn();
        window.addEventListener('mealfit:refresh-inventory', oyente);
        vi.mocked(fetchWithAuth).mockImplementation(async (url) => (url === '/api/diary/consumed/repeat'
            ? respuesta({ success: true, already_logged: false, meal_id: 'meal-2' })
            : respuesta(detalle())));
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /Repetir hoy/ }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        const llamada = vi.mocked(fetchWithAuth).mock.calls.find(([u]) => u === '/api/diary/consumed/repeat');
        expect(JSON.parse(llamada[1].body)).toEqual({ source_meal_id: 'meal-1', meal_type: 'almuerzo', days_ago: 0 });
        expect(oyente).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalled();
        window.removeEventListener('mealfit:refresh-inventory', oyente);
    });

    it('«Eliminar» usa el borrado de la fila y cierra solo si se borró', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle()));
        const onClose = vi.fn();
        const onEliminar = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={onClose} onEliminar={onEliminar} />);
        fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
        await waitFor(() => expect(onEliminar).toHaveBeenCalledTimes(1));
        expect(onClose).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Eliminar' })).not.toBeDisabled());
        fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(onEliminar).toHaveBeenCalledWith(MEAL);
    });

    it('con la confirmación de «Eliminar» abierta, Escape no cierra la ficha', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle()));
        const onClose = vi.fn();
        let responder;
        const onEliminar = vi.fn(() => new Promise((r) => { responder = r; }));   // la confirmación, abierta
        render(<FichaDeComida meal={MEAL} userId={UID} metas={METAS} onClose={onClose} onEliminar={onEliminar} />);
        fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
        await waitFor(() => expect(onEliminar).toHaveBeenCalled());
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
        await act(async () => { responder(false); });   // el usuario canceló
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('una comida anotada otro día no inventa la hora (y ya no explica cuándo se anotó [762])', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(detalle()));
        const ayer = new Date(Date.now() - 86400000);
        const meal = { ...MEAL, consumed_at: ayer.toISOString(), created_at: new Date().toISOString() };
        render(<FichaDeComida meal={meal} userId={UID} metas={METAS} onClose={vi.fn()} />);
        expect(screen.queryByText(/Lo anotaste el/)).not.toBeInTheDocument();
        // franja y día, sin hora (la de un registro retrodatado es la del REGISTRO)
        expect(document.getElementById('ficha-comida-cuando').textContent).toMatch(/^Almuerzo · Ayer$/);
    });
});

// ─────────────────────────── la fila abre la ficha ───────────────────────────

describe('la fila del contador', () => {
    it('abre la ficha y enseña la miniatura si hay foto', async () => {
        vi.mocked(useIdsConFoto).mockReturnValue(new Set(['meal-1']));
        vi.mocked(useFotoDeComida).mockImplementation((uid, id, tipo) => (tipo === 'mini' ? 'blob:mini' : null));
        vi.mocked(fetchWithAuth).mockImplementation(async (url) => (String(url).startsWith('/api/diary/consumed/')
            ? respuesta({ meals: [MEAL], totals: { calories: 740, protein: 42, carbs: 95, healthy_fats: 18 } })
            : respuesta(detalle())));
        const { container } = render(<TrackingProgress planData={{ calories: 2000, macros: { protein: 150, carbs: 250, fats: 60 } }} userId={UID} />);
        const fila = await screen.findByRole('button', { name: new RegExp(`^${MEAL.meal_name}`) });
        expect(container.querySelector('img[src="blob:mini"]')).not.toBeNull();
        await act(async () => { fireEvent.click(fila); });
        expect(await screen.findByRole('dialog', {}, { timeout: 3000 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: MEAL.meal_name })).toBeInTheDocument();
    });

    it('borrar desde la fila borra también la foto del dispositivo', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
            if (opts?.method === 'DELETE') return respuesta({ success: true });
            return respuesta({ meals: [MEAL], totals: { calories: 740, protein: 42, carbs: 95, healthy_fats: 18 } });
        });
        render(<TrackingProgress planData={{ calories: 2000, macros: { protein: 150, carbs: 250, fats: 60 } }} userId={UID} />);
        fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Eliminar ${MEAL.meal_name}`) }));
        await waitFor(() => expect(borrarFotoDeComidaEnSegundoPlano).toHaveBeenCalledWith(UID, 'meal-1'));
    });
});

describe('la fila del cajón de días anteriores', () => {
    it('abre la ficha; Escape la cierra a ELLA y no al cajón', async () => {
        const { default: DiaryHistory } = await import('../components/dashboard/DiaryHistory');
        vi.mocked(fetchWithAuth).mockImplementation(async (url) => {
            const u = String(url);
            if (u.startsWith('/api/diary/consumed-range/')) return respuesta({ days: [] });
            if (u.startsWith('/api/diary/consumed/')) {
                return respuesta({ meals: [MEAL], totals: { calories: 740, protein: 42, carbs: 95, healthy_fats: 18, micros: null, micros_coverage: { con_datos: 0, total: 1 } } });
            }
            return respuesta(detalle());
        });
        const onClose = vi.fn();
        render(<DiaryHistory open userId={UID} onClose={onClose} targetCalories={2000} targetMacros={{ protein: 150, carbs: 250, fats: 60 }} />);
        const fila = await screen.findByRole('button', { name: new RegExp(`^${MEAL.meal_name}`) });
        await act(async () => { fireEvent.click(fila); });
        const titulo = await screen.findByRole('heading', { name: MEAL.meal_name }, { timeout: 3000 });
        expect(titulo.id).toBe('ficha-comida-titulo');
        fireEvent.keyDown(window, { key: 'Escape' });
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(document.getElementById('ficha-comida-titulo')).toBeNull());
        expect(onClose).not.toHaveBeenCalled();
    });
});

// ─────────────────────────── la capa de la ficha ───────────────────────────

describe('la ficha en la escala de capas', () => {
    it('gana al cajón de días anteriores y deja la confirmación de «Eliminar» por encima', async () => {
        const { cargarEscala } = await import('./utils/zLayers');
        const escala = cargarEscala();
        const css = leer('components/dashboard/FichaDeComida.module.css');
        const token = /\.overlay\s*\{[^}]*z-index:\s*var\((--z-[a-z-]+)/.exec(css)?.[1];
        expect(token).toBe('--z-drawer');
        // el cajón usa --z-cover / --z-cover-top; la confirmación, el Modal común en --z-modal (dentro de #root)
        expect(escala[token]).toBeGreaterThan(escala['--z-cover-top']);
        expect(escala[token]).toBeLessThan(escala['--z-modal']);
        expect(leer('components/dashboard/DiaryHistory.module.css')).toMatch(/z-index:\s*var\(--z-cover-top\)/);
        expect(leer('components/common/Modal.jsx')).toContain("zIndex: 'var(--z-modal)'");
    });
});

// ─────────────────────────── el almacén de fotos ───────────────────────────

describe('fotosDeComidas', () => {
    it('poda lo de más de 90 días y, del resto, lo más viejo por encima de 400', () => {
        const ahora = 1_000_000_000_000;
        const dia = 86400000;
        const entradas = [
            { clave: 'u:vieja', creada: ahora - (RETENCION_DIAS + 1) * dia },
            ...Array.from({ length: MAX_FOTOS + 2 }, (_, i) => ({ clave: `u:${i}`, creada: ahora - (MAX_FOTOS + 2 - i) * 1000 })),
        ];
        const fuera = clavesAPodar(entradas, ahora);
        expect(fuera).toEqual(['u:vieja', 'u:0', 'u:1']);
        expect(clavesAPodar([{ clave: 'a', creada: ahora }], ahora)).toEqual([]);
        expect(clavesAPodar(null, ahora)).toEqual([]);
    });

    it('sin IndexedDB (modo privado, jsdom) nada revienta: sin foto', async () => {
        expect(typeof indexedDB).toBe('undefined');
        const blob = new Blob(['x'], { type: 'image/jpeg' });
        await expect(guardarFotoDeComida(UID, 'meal-1', blob)).resolves.toBe(false);
        await expect(leerFotoDeComida(UID, 'meal-1')).resolves.toBeNull();
        await expect(idsConFoto(UID)).resolves.toEqual(new Set());
        await expect(borrarFotoDeComida(UID, 'meal-1')).resolves.toBeUndefined();
        await expect(borrarFotosDelUsuario(UID)).resolves.toBeUndefined();
    });

    it('un invitado o una comida sin id no guardan nada', async () => {
        const blob = new Blob(['x'], { type: 'image/jpeg' });
        await expect(guardarFotoDeComida('guest', 'meal-1', blob)).resolves.toBe(false);
        await expect(guardarFotoDeComida(UID, '', blob)).resolves.toBe(false);
        await expect(guardarFotoDeComida(UID, 'meal-1', 'no-es-un-blob')).resolves.toBe(false);
    });

    it('el evento del almacén es el mismo que escuchan los hooks', () => {
        expect(leer('hooks/useFotosDeComidas.js')).toContain(`const EVENTO = '${EVENTO_FOTOS_DE_COMIDAS}';`);
    });
});

// ─────────────────────────── la foto no viaja ───────────────────────────

describe('la foto vive solo en el dispositivo', () => {
    it('el almacén no habla con la red', () => {
        const almacen = leer('utils/fotosDeComidas.js');
        expect(almacen).not.toMatch(/fetchWithAuth|fetch\(|XMLHttpRequest|sendBeacon/);
    });

    it('el escáner guarda la foto con el meal_id del alta, y solo si hubo alta nueva', () => {
        const escaner = leer('components/dashboard/ScanMealModal.jsx');
        expect(escaner).toContain("import { guardarFotoDeComida } from '../../utils/fotosDeComidas';");
        expect(escaner).toContain('if (data.meal_id && !data.already_logged) void guardarFotoDeComida(userId, data.meal_id, p.file)');
    });

    it('borrar la cuenta borra sus fotos; el cierre de sesión no (la clave lleva el usuario)', () => {
        expect(leer('components/account/DeleteAccountSection.jsx')).toContain('m.borrarFotosDelUsuario(_uid)');
        expect(leer('context/AssessmentContext.jsx')).not.toContain('fotosDeComidas');
    });

    it('el componedor marca lo estimado para la ficha', () => {
        expect(leer('components/dashboard/LogMealModal.jsx')).toContain("origin: lines.some((l) => l.estimated) ? 'estimate' : undefined,");
    });
});
