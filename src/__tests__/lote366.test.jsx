// [P1-PLAN-LOTE-366 · 2026-09-26] Con varias fotos, cada plato puede ir a su propia comida y su propio día.
//
// El dueño: «si subo dos fotos, ¿puedo dividir sus horarios y para qué día va cada plato?». No se podía: «¿Qué comida
// es?» y «¿Cuándo?» salían una vez y valían para todos (la batida del desayuno de ayer quedaba como el almuerzo de hoy).
// Ahora, con dos o más platos, cada tarjeta dice a qué comida y día va; por defecto todos siguen lo de abajo (un toque,
// como antes) y uno se separa con «Otra comida u otro día». Con un solo plato no cambia nada.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ScanMealModal from '../components/dashboard/ScanMealModal';
import { destinoDelPlato, conDestinoPropio } from '../components/dashboard/scanMealDishes';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('../components/common/CameraViewfinder', () => ({ default: () => null }));
vi.mock('../config/platform', () => ({ isNativeApp: vi.fn(() => false) }));
vi.mock('../utils/observability', () => ({ captureException: vi.fn() }));
vi.mock('../utils/nativeChatImagePicker', () => ({ chooseNativeGalleryImages: vi.fn(), isNativePickerCancellation: () => false }));

const PLATANO = {
    success: true, is_food: true, photo_kind: 'plato', meal_name: 'Plátano con chuleta',
    macros: { calories: 550, protein: 28, carbs: 60, healthy_fats: 20 }, items: [],
};
const BATIDA = {
    success: true, is_food: true, photo_kind: 'plato', meal_name: 'Batida de lechosa',
    macros: { calories: 280, protein: 10, carbs: 40, healthy_fats: 9 }, items: [],
};
const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

class FakeImage {
    constructor() { this.width = 1920; this.height = 1080; this._src = ''; }
    set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
    get src() { return this._src; }
}

let cola;
let consumidas;
beforeEach(() => {
    cola = [];
    consumidas = [];
    Object.values(toast).forEach((f) => f.mockReset());
    global.Image = FakeImage;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb, type) {
        cb(new Blob(['x'], { type: type || 'image/jpeg' }));
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = vi.fn();
    vi.mocked(fetchWithAuth).mockReset();
    vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
        if (url === '/api/diary/upload') return respuesta(cola.shift());
        if (url === '/api/diary/consumed' && opts?.method === 'POST') {
            consumidas.push(JSON.parse(opts.body));
            return respuesta({ success: true, already_logged: false, deducted: [], inferred: [], not_in_pantry: [] });
        }
        return respuesta({});
    });
});

const foto = (n) => new File(['x'], n, { type: 'image/jpeg' });
const elegir = (...files) => {
    const inputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { files } });
};
const grupoDeAbajo = (nombre) => within(screen.getAllByRole('group', { name: nombre }).at(-1));

describe('[366] el destino de un plato', () => {
    it('sin destino propio sigue lo de abajo; con destino propio, el suyo', () => {
        expect(destinoDelPlato({}, 'almuerzo', 0)).toEqual({ mealType: 'almuerzo', daysAgo: 0, propio: false });
        const p = conDestinoPropio({}, { mealType: 'desayuno', daysAgo: 1 });
        expect(destinoDelPlato(p, 'almuerzo', 0)).toEqual({ mealType: 'desayuno', daysAgo: 1, propio: true });
        expect(destinoDelPlato(conDestinoPropio(p, null), 'almuerzo', 0).propio).toBe(false);
    });
});

describe('[366] dos fotos, dos comidas', () => {
    it('la batida va al desayuno de ayer y el plátano al almuerzo de hoy', async () => {
        cola = [PLATANO, BATIDA];
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        elegir(foto('a.jpg'), foto('b.jpg'));
        const registrar = await screen.findByRole('button', { name: /Registrar 2 platos/ });
        fireEvent.click(grupoDeAbajo('Tipo de comida').getByRole('button', { name: 'Almuerzo' }));
        fireEvent.click(grupoDeAbajo('Día').getByRole('button', { name: 'Hoy' }));

        // cada tarjeta dice a dónde va
        expect(screen.getAllByText('Almuerzo · Hoy')).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: /^Batida de lechosa/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Otra comida u otro día' }));
        const propio = screen.getByRole('region', { name: '¿Qué comida es este plato?' });
        fireEvent.click(within(propio).getByRole('button', { name: 'Desayuno' }));
        fireEvent.click(within(propio).getByRole('button', { name: 'Ayer' }));
        expect(screen.getByText('Desayuno · Ayer')).toBeInTheDocument();

        // cambiar lo de abajo ya no la mueve
        fireEvent.click(grupoDeAbajo('Tipo de comida').getByRole('button', { name: 'Cena' }));
        expect(screen.getByText('Desayuno · Ayer')).toBeInTheDocument();
        expect(screen.getByText('Cena · Hoy')).toBeInTheDocument();

        fireEvent.click(registrar);
        await waitFor(() => expect(consumidas).toHaveLength(2));
        expect(consumidas.map((b) => [b.meal_name, b.meal_type, b.days_ago])).toEqual([
            ['Plátano con chuleta', 'cena', 0],
            ['Batida de lechosa', 'desayuno', 1],
        ]);
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(toast.success.mock.calls[0][1].description).toContain('Batida de lechosa quedó en el diario de ayer');
    });

    it('«Usar lo de abajo» la devuelve al destino común', async () => {
        cola = [PLATANO, BATIDA];
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        elegir(foto('a.jpg'), foto('b.jpg'));
        await screen.findByRole('button', { name: /Registrar 2 platos/ });
        fireEvent.click(grupoDeAbajo('Tipo de comida').getByRole('button', { name: 'Almuerzo' }));
        fireEvent.click(screen.getByRole('button', { name: /^Batida de lechosa/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Otra comida u otro día' }));
        fireEvent.click(within(screen.getByRole('region', { name: '¿Qué comida es este plato?' })).getByRole('button', { name: 'Desayuno' }));
        fireEvent.click(screen.getByRole('button', { name: 'Usar lo de abajo' }));
        expect(screen.queryByRole('region', { name: '¿Qué comida es este plato?' })).toBeNull();
        expect(screen.queryByText(/^Desayuno · /)).toBeNull();
    });

    it('con una sola foto no aparece nada nuevo', async () => {
        cola = [BATIDA];
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        elegir(foto('b.jpg'));
        await screen.findByRole('button', { name: /Registrar comida/ });
        expect(screen.queryByRole('button', { name: 'Otra comida u otro día' })).toBeNull();
    });
});
