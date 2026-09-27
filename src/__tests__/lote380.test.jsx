// [P1-PLAN-LOTE-380 · 2026-09-26] El escáner no registra a medias ni esconde a dónde va el plato.
//
// Auditoría de «Registrar comida»:
//   3. Se podía tocar «Registrar» con una corrección «Calculando…» («Otra…», «Cambiar», «Descríbelo»): se guardaban
//      las macros VIEJAS y la respuesta llegaba con la hoja cerrada. Ahora «Registrar» espera («Calculando…»).
//   4. Con dos platos, marcar el 2.º «Desayuno · Ayer» y quitar el 1.º dejaba ese destino invisible (la vista de un
//      plato no lo pinta) y los chips de abajo mentían. Al quedar uno, su destino pasa a ser el de abajo.
//   6. «Cambiar» calculaba con una cantidad y repartía con la que el usuario puso mientras esperaba: el ingrediente
//      quedaba a la mitad. Ahora se reparte con la cantidad CON LA QUE SE CALCULÓ, y el stepper de esa fila espera.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import ScanMealModal from '../components/dashboard/ScanMealModal';
import { platoDesdeAnalisis, conCantidad, conIngredienteCambiado, kcalDelComponente } from '../components/dashboard/scanMealDishes';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('../components/common/CameraViewfinder', () => ({ default: () => null }));
vi.mock('../config/platform', () => ({ isNativeApp: vi.fn(() => false) }));
vi.mock('../utils/observability', () => ({ captureException: vi.fn() }));
vi.mock('../utils/nativeChatImagePicker', () => ({ chooseNativeGalleryImages: vi.fn(), isNativePickerCancellation: () => false }));

const mac = (calories) => ({ calories, protein: 0, carbs: 0, healthy_fats: 0 });
const QUESO = {
    success: true, is_food: true, photo_kind: 'plato', meal_name: 'Sándwich',
    macros: mac(490), items: [{ name: 'Pan', quantity: 2, unit: 'rebanada', macros: mac(340) }, { name: 'Queso', quantity: 2, unit: 'lasca', macros: mac(150) }],
};
const JUGO = { success: true, is_food: true, photo_kind: 'plato', meal_name: 'Jugo', macros: mac(140), items: [] };
const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

class FakeImage {
    constructor() { this.width = 1920; this.height = 1080; this._src = ''; }
    set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
    get src() { return this._src; }
}

let cola;
let consumidas;
let soltarIngrediente;
beforeEach(() => {
    cola = [];
    consumidas = [];
    soltarIngrediente = null;
    Object.values(toast).forEach((f) => f.mockReset());
    global.Image = FakeImage;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb, type) { cb(new Blob(['x'], { type: type || 'image/jpeg' })); });
    global.URL.createObjectURL = vi.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = vi.fn();
    vi.mocked(fetchWithAuth).mockReset();
    vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
        if (url === '/api/diary/upload') return respuesta(cola.shift());
        if (url === '/api/diary/scan/ingrediente') {
            await new Promise((r) => { soltarIngrediente = r; });
            return respuesta({ nombre: 'Queso mozzarella', macros: mac(160), anteriores: mac(150) });
        }
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

describe('[380] no se registra con una corrección en vuelo', () => {
    it('«Registrar» espera mientras «Cambiar» calcula y se habilita con el resultado aplicado', async () => {
        cola = [QUESO];
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        elegir(foto('a.jpg'));
        await screen.findByRole('button', { name: /Registrar comida/ });
        fireEvent.click(screen.getByRole('button', { name: 'Cambiar Queso' }));
        const campo = screen.getByLabelText('¿Qué era Queso?');
        fireEvent.change(campo, { target: { value: 'Queso mozzarella' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        const boton = await screen.findByRole('button', { name: /Calculando/ });
        expect(boton).toBeDisabled();
        fireEvent.click(boton);
        expect(consumidas).toHaveLength(0);
        await act(async () => { soltarIngrediente(); });
        const registrar = await screen.findByRole('button', { name: /Registrar comida/ });
        expect(registrar).not.toBeDisabled();
        fireEvent.click(registrar);
        await waitFor(() => expect(consumidas).toHaveLength(1));
        expect(consumidas[0].calories).toBe(500);
        expect(consumidas[0].ingredients).toContain('2 lasca de Queso mozzarella');
    });
});

describe('[380] al quedar un plato, su comida y su día pasan a los de abajo', () => {
    it('quitar el otro plato no esconde «Desayuno · Ayer»', async () => {
        cola = [QUESO, JUGO];
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        elegir(foto('a.jpg'), foto('b.jpg'));
        await screen.findByRole('button', { name: /Registrar 2 platos/ });
        const abajo = (n) => within(screen.getAllByRole('group', { name: n }).at(-1));
        fireEvent.click(screen.getByRole('button', { name: /^Comida y día de Jugo/ }));   // [P1-PLAN-LOTE-387]
        const propio = within(screen.getByRole('region', { name: '¿Qué comida es este plato?' }));
        fireEvent.click(propio.getByRole('button', { name: 'Desayuno' }));
        fireEvent.click(propio.getByRole('button', { name: 'Ayer' }));
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Sándwich' }));
        const registrar = await screen.findByRole('button', { name: /Registrar comida/ });
        expect(abajo('Tipo de comida').getByRole('button', { name: 'Desayuno' })).toHaveAttribute('aria-pressed', 'true');
        expect(abajo('Día').getByRole('button', { name: 'Ayer' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(registrar);
        await waitFor(() => expect(consumidas).toHaveLength(1));
        expect([consumidas[0].meal_type, consumidas[0].days_ago]).toEqual(['desayuno', 1]);
    });
});

describe('[380] «Cambiar» reparte con la cantidad con la que se calculó', () => {
    it('si la cantidad cambió mientras calculaba, el ingrediente no queda a la mitad', () => {
        let p = platoDesdeAnalisis(QUESO);
        p = conCantidad(p, '1', 4);                                     // el usuario sube a 4 mientras espera
        p = conIngredienteCambiado(p, '1', 'Queso mozzarella', mac(160), mac(150), 2);   // calculado para 2
        expect(kcalDelComponente(p.componentes[1])).toBe(320);
    });
});
