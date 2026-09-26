// [P1-PLAN-LOTE-382 · 2026-09-26] El escáner hereda la comida del componedor, ofrece «Extra» y dice la verdad.
//
// Auditoría de «Registrar comida»:
//   8. «Comí otra cosa» en el Almuerzo abría el componedor en «almuerzo»; «Escanear con foto» abría el escáner con la
//      comida ADIVINADA por la hora (a las 16:00, «merienda»): el almuerzo del plan no se marcaba. Ahora el componedor
//      le pasa su comida y su día.
//   · «Extra» (antojo o picoteo fuera de tus comidas) existía en el componedor y no en el escáner: un antojo escaneado
//     marcaba un plato del plan.
//   · Sin desglose, la pista decía «Desmarca lo que no lleve» como si eso moviera las calorías (no las mueve).
//   · El aviso de un plato no daba formato a las kcal; «Cambiar» aceptaba 1 letra (el servidor pide 2); dos opciones
//     con el mismo texto chocaban de `key`; lo escrito en «Otra…» se cortaba a 40 caracteres sin avisar (ahora 60).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ScanMealModal from '../components/dashboard/ScanMealModal';
import { conRespuestaEscrita, platoDesdeAnalisis } from '../components/dashboard/scanMealDishes';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('../components/common/CameraViewfinder', () => ({ default: () => null }));
vi.mock('../config/platform', () => ({ isNativeApp: vi.fn(() => false) }));
vi.mock('../utils/observability', () => ({ captureException: vi.fn() }));
vi.mock('../utils/nativeChatImagePicker', () => ({ chooseNativeGalleryImages: vi.fn(), isNativePickerCancellation: () => false }));

const mac = (calories) => ({ calories, protein: 0, carbs: 0, healthy_fats: 0 });
const SIN_DESGLOSE = {
    success: true, is_food: true, photo_kind: 'plato', meal_name: 'Mangú con los tres golpes',
    macros: mac(1040), items: [{ name: 'Queso', quantity: 2, unit: 'lasca' }],
};
const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });
class FakeImage {
    constructor() { this.width = 1920; this.height = 1080; this._src = ''; }
    set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
    get src() { return this._src; }
}
let consumidas;
beforeEach(() => {
    consumidas = [];
    Object.values(toast).forEach((f) => f.mockReset());
    global.Image = FakeImage;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb, type) { cb(new Blob(['x'], { type: type || 'image/jpeg' })); });
    global.URL.createObjectURL = vi.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = vi.fn();
    vi.mocked(fetchWithAuth).mockReset();
    vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
        if (url === '/api/diary/upload') return respuesta(SIN_DESGLOSE);
        if (url === '/api/diary/consumed' && opts?.method === 'POST') {
            consumidas.push(JSON.parse(opts.body));
            return respuesta({ success: true, already_logged: false, deducted: [], inferred: [], not_in_pantry: [] });
        }
        return respuesta({});
    });
});
const elegirFoto = () => {
    const inputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
};
const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('[382] el escáner', () => {
    it('nace en la comida que le pasan y ofrece «Extra»; el aviso da formato a las kcal', async () => {
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" initialMealType="almuerzo" />);
        elegirFoto();
        const registrar = await screen.findByRole('button', { name: /Registrar comida/ });
        const tipos = within(screen.getByRole('group', { name: 'Tipo de comida' }));
        expect(tipos.getByRole('button', { name: 'Almuerzo' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(tipos.getByRole('button', { name: 'Extra' }));
        fireEvent.click(registrar);
        await waitFor(() => expect(consumidas).toHaveLength(1));
        expect(consumidas[0].meal_type).toBe('extra');
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(toast.success.mock.calls[0][0]).toMatch(/^Mangú con los tres golpes registrada \(1.040 kcal\)\.$/);
    });

    it('sin desglose, la pista no promete que desmarcar mueva las calorías', async () => {
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        elegirFoto();
        await screen.findByRole('button', { name: /Registrar comida/ });
        expect(screen.getByText('Desmarca lo que no lleve o ajusta la cantidad. Las calorías de arriba no cambian solas: corrígelas si hace falta.')).toBeInTheDocument();
    });

    it('«Cambiar» pide al menos 2 letras (como el servidor)', async () => {
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        elegirFoto();
        await screen.findByRole('button', { name: /Registrar comida/ });
        fireEvent.click(screen.getByRole('button', { name: 'Cambiar Queso' }));
        fireEvent.change(screen.getByLabelText('¿Qué era Queso?'), { target: { value: 'Q' } });
        expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    });

    it('lo escrito en «Otra…» se guarda hasta 60 caracteres', () => {
        const p = platoDesdeAnalisis({ ...SIN_DESGLOSE, dudas: [{ sobre: 'Queso', pregunta: '¿Qué queso?', opciones: [
            { texto: 'Queso', supuesta: true, ajuste: mac(0) }, { texto: 'Queso de freír', supuesta: false, ajuste: mac(20) },
        ] }] });
        const largo = 'Queso de hoja fresco de la zona de Moca, sin sal añadida';
        const r = conRespuestaEscrita(p, 0, largo, mac(10));
        expect(r.dudas[0].opciones.at(-1).texto).toBe(largo.slice(0, 60));
    });
});

describe('[382] el componedor le pasa su comida y su día al escáner', () => {
    it('onScan lleva mealType y daysAgo; los dos padres los usan', () => {
        const lm = leer('components/dashboard/LogMealModal.jsx');
        expect(lm).toContain('onClick={() => onScan({ mealType, daysAgo })}');
        const dash = leer('pages/Dashboard.jsx');
        expect(dash).toContain('onScan={(d) => { setLogMealOpen(false); setScanMealOpen(d || true); }}');
        expect(dash).toContain('initialMealType={scanMealOpen?.mealType}');
        const tp = leer('components/dashboard/TrackingProgress.jsx');
        expect(tp).toContain('const handleLogToScan = useCallback((d) => { setLogOpen(false); setScanOpen(d || true); }, []);');
        expect(tp).toContain('initialMealType={scanOpen?.mealType}');
        const dudas = leer('components/common/DudasDeLaFoto.jsx');
        expect(dudas).toContain('key={`${j}-${o.texto}`}');
    });
});
