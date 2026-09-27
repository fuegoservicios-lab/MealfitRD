// [P1-PLAN-LOTE-389 · 2026-09-27] Con varios platos, la comida y el día viven SOLO en cada tarjeta.
//
// El dueño (captura con «Cena · Hoy ✎» en la tarjeta y, abajo, «¿Qué comida es? — Para los platos que no marcaste
// aparte»): «esto de abajo sobra, ya configuré el horario y el día de manera individual». Dos sitios para lo mismo
// obligaban a pensar en dos niveles. Ahora: con 2+ platos no hay sección de abajo; cada plato nace con la comida de la
// hora (o la del componedor) y se cambia en su tarjeta. Con un plato, abajo como siempre (no hay tarjeta).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ScanMealModal from '../components/dashboard/ScanMealModal';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('../components/common/CameraViewfinder', () => ({ default: () => null }));
vi.mock('../config/platform', () => ({ isNativeApp: vi.fn(() => false) }));
vi.mock('../utils/observability', () => ({ captureException: vi.fn() }));
vi.mock('../utils/nativeChatImagePicker', () => ({ chooseNativeGalleryImages: vi.fn(), isNativePickerCancellation: () => false }));

const mac = (calories) => ({ calories, protein: 0, carbs: 0, healthy_fats: 0 });
const A = { success: true, is_food: true, photo_kind: 'plato', meal_name: 'Yuca con chicharrón', macros: mac(875), items: [] };
const B = { success: true, is_food: true, photo_kind: 'plato', meal_name: 'Sardinas con garbanzos', macros: mac(300), items: [] };
const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });
class FakeImage {
    constructor() { this.width = 1920; this.height = 1080; this._src = ''; }
    set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
    get src() { return this._src; }
}
let cola;
let consumidas;
beforeEach(() => {
    consumidas = [];
    global.Image = FakeImage;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb, type) { cb(new Blob(['x'], { type: type || 'image/jpeg' })); });
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
const elegir = (n) => {
    const inputs = document.querySelectorAll('input[type="file"]');
    const files = Array.from({ length: n }, (_, i) => new File(['x'], `${i}.jpg`, { type: 'image/jpeg' }));
    fireEvent.change(inputs[inputs.length - 1], { target: { files } });
};

describe('[389] un solo sitio para la comida y el día', () => {
    it('con dos platos no hay sección de abajo; cada tarjeta nace con la comida pedida y se cambia ahí', async () => {
        cola = [A, B];
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" initialMealType="almuerzo" />);
        elegir(2);
        const registrar = await screen.findByRole('button', { name: /Registrar 2 platos/ });
        expect(screen.queryByRole('group', { name: 'Tipo de comida' })).toBeNull();
        expect(screen.queryByRole('group', { name: 'Día' })).toBeNull();
        expect(screen.getAllByText('Almuerzo · Hoy')).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: /^Comida y día de Sardinas con garbanzos/ }));
        const region = within(screen.getByRole('region', { name: '¿Qué comida es este plato?' }));
        expect(region.queryByRole('button', { name: 'Usar lo de abajo' })).toBeNull();
        fireEvent.click(region.getByRole('button', { name: 'Cena' }));   // [P1-PLAN-LOTE-410] aplica y cierra

        fireEvent.click(registrar);
        await waitFor(() => expect(consumidas).toHaveLength(2));
        expect(consumidas.map((b) => b.meal_type)).toEqual(['almuerzo', 'cena']);
    });

    it('con un plato, la comida y el día siguen abajo', async () => {
        cola = [A];
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        elegir(1);
        await screen.findByRole('button', { name: /Registrar comida/ });
        expect(screen.getByRole('group', { name: 'Tipo de comida' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Día' })).toBeInTheDocument();
    });
});
