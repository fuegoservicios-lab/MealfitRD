// [P1-PLAN-LOTE-387 · 2026-09-27] La comida y el día de cada plato se cambian DESDE SU TARJETA.
//
// El dueño (captura con «Extra · Hoy» en las dos tarjetas): «estos dos platos son del mismo día pero tienen horarios
// separados, pero no puedo editar eso». El 366 lo permitía… escondido: abrir la tarjeta y bajar hasta el final del
// editor. Ahora «Extra · Hoy» es un botón en la tarjeta que abre ahí mismo la comida y el día de ese plato; elegir
// marca el plato aparte; «Usar lo de abajo» lo devuelve; «Listo» cierra. El editor ya no tiene su copia.
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
const YUCA = { success: true, is_food: true, photo_kind: 'plato', meal_name: 'Yuca con chicharrón', macros: mac(875), items: [] };
const GARBANZOS = { success: true, is_food: true, photo_kind: 'plato', meal_name: 'Garbanzos con sardinas', macros: mac(315), items: [] };
const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });
class FakeImage {
    constructor() { this.width = 1920; this.height = 1080; this._src = ''; }
    set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
    get src() { return this._src; }
}
let cola;
let consumidas;
beforeEach(() => {
    cola = [YUCA, GARBANZOS];
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
const elegir = () => {
    const inputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' }), new File(['x'], 'b.jpg', { type: 'image/jpeg' })] } });
};

describe('[387] comida y día desde la tarjeta', () => {
    it('almuerzo para uno y cena para el otro, sin abrir los editores', async () => {
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" initialMealType="extra" />);
        elegir();
        const registrar = await screen.findByRole('button', { name: /Registrar 2 platos/ });

        fireEvent.click(screen.getByRole('button', { name: /^Comida y día de Yuca con chicharrón/ }));
        const region = within(screen.getByRole('region', { name: '¿Qué comida es este plato?' }));
        fireEvent.click(region.getByRole('button', { name: 'Almuerzo' }));
        fireEvent.click(region.getByRole('button', { name: 'Listo' }));
        expect(screen.queryByRole('region', { name: '¿Qué comida es este plato?' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /^Comida y día de Garbanzos con sardinas/ }));
        const region2 = within(screen.getByRole('region', { name: '¿Qué comida es este plato?' }));
        fireEvent.click(region2.getByRole('button', { name: 'Cena' }));
        fireEvent.click(region2.getByRole('button', { name: 'Listo' }));

        expect(screen.getByText('Almuerzo · Hoy')).toBeInTheDocument();
        expect(screen.getByText('Cena · Hoy')).toBeInTheDocument();
        // el editor no repite la sección
        expect(screen.queryByRole('button', { name: 'Otra comida u otro día' })).toBeNull();

        fireEvent.click(registrar);
        await waitFor(() => expect(consumidas).toHaveLength(2));
        expect(consumidas.map((b) => [b.meal_name, b.meal_type])).toEqual([
            ['Yuca con chicharrón', 'almuerzo'], ['Garbanzos con sardinas', 'cena'],
        ]);
    });
});
