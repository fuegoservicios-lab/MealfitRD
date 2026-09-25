// [P1-PLAN-LOTE-106 · 2026-09-18] El escáner de fotos, rehecho para el teléfono (el dueño, con captura de la revisión:
// «no sé si es el tamaño o la estructura del diseño, quiero que sea más cómodo, fácil de entender, de interactuar y
// también agrega algo para poder seleccionar el día, ayer y antier, ya que esa es mi cena del día de ayer»).
//  · la misma hoja que el componedor: cabecera y pie fijos, cuerpo desplazable, el gesto compartido (useBottomSheet);
//  · la revisión son cuatro preguntas con chips («¿Qué es?», «¿Cuánto comiste?», «¿Qué comida es?», «¿Cuándo?»), sin
//    desplegables; «¿Cuándo?» manda `days_ago` a POST /api/diary/consumed (el backend ya lo aceptaba);
//  · al registrar en otro día el aviso dice dónde verlo («Ver días anteriores»).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ScanMealModal from '../components/dashboard/ScanMealModal';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('../components/common/CameraViewfinder', () => ({ default: () => null }));

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const plano = (s) => s.split(/\s+/).join(' ');
const regla = (css, sel) => {
    const i = css.indexOf(`\n${sel} {`);
    expect(i, `falta ${sel}`).toBeGreaterThan(-1);
    return plano(css.slice(i, css.indexOf('}', i)));
};
const respuesta = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

const ANALISIS = {
    success: true, is_food: true, photo_kind: 'plato', meal_name: 'Yuca con chicharrón y huevo frito',
    macros: { calories: 830, protein: 35, carbs: 77, healthy_fats: 44 },
    items: [{ name: 'yuca hervida', quantity: 4, unit: 'unidad' }],
};

// Bajo la carga del gate (vitest en paralelo) el flujo de la modal pasó de 1 s: topes amplios, no lógica nueva.
const ESPERA = { timeout: 5000 };

const llegarARevision = async () => {
    // el input de galería siempre existe (el de cámara solo con puntero grueso)
    const inputs = document.querySelectorAll('input[type="file"]');
    const galeria = inputs[inputs.length - 1];
    const file = new File(['x'], 'plato.jpg', { type: 'image/jpeg' });
    fireEvent.change(galeria, { target: { files: [file] } });
    await screen.findByText('Revisa y registra', {}, ESPERA);
};

// jsdom no carga imágenes ni dispara onerror: el mismo FakeImage de ScanMealModal.photo_deducts (patrón del repo).
class FakeImage {
    constructor() { this.width = 1920; this.height = 1080; this._src = ''; }
    set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
    get src() { return this._src; }
}

beforeEach(() => {
    fetchWithAuth.mockReset();
    toast.success.mockReset();
    global.Image = FakeImage;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb, type) {
        cb(new Blob(['fake-bytes'], { type: type || 'image/jpeg' }));
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = vi.fn();
    fetchWithAuth.mockImplementation(async (url, opts) => {
        if (String(url).startsWith('/api/diary/upload')) return respuesta(ANALISIS);
        if (url === '/api/diary/consumed' && opts?.method === 'POST') return respuesta({ success: true, deducted: [] });
        return respuesta({});
    });
});

describe('la hoja del escáner', () => {
    it('tiene cabecera y pie fijos con cuerpo desplazable, la hoja inferior en el teléfono y el gesto compartido', () => {
        const css = src('src/components/dashboard/ScanMealModal.module.css');
        expect(regla(css, '.card')).toContain('display: flex; flex-direction: column;');
        expect(regla(css, '.card')).toContain('max-height: 94dvh;');
        expect(regla(css, '.card')).toContain('border-radius: 22px 22px 0 0;');
        expect(regla(css, '.overlay')).toContain('align-items: flex-end;');
        expect(regla(css, '.body')).toContain('flex: 1 1 auto; min-height: 0; overflow-y: auto;');
        expect(regla(css, '.body')).toContain('touch-action: pan-y;');
        expect(regla(css, '.footer')).toContain('env(safe-area-inset-bottom, 0px)');
        // el ancla de P1-MEAL-SCAN-POLISH sigue: las acciones en fila, ahora dentro del pie
        expect(regla(css, '.actions')).toContain('flex-direction: row;');
        const jsx = src('src/components/dashboard/ScanMealModal.jsx');
        expect(jsx).toContain('const hoja = useBottomSheet({ containerRef, bodyRef, onClose, disabled: isBusy });');
        for (const h of ['onTouchStart={hoja.onTouchStart}', 'onTouchMove={hoja.onTouchMove}', 'onTouchEnd={hoja.onTouchEnd}', 'onTouchCancel={hoja.onTouchEnd}']) {
            expect(jsx).toContain(h);
        }
        // el componedor usa EL MISMO hook (extraído, no copiado)
        expect(src('src/components/dashboard/LogMealModal.jsx')).toContain("import { useBottomSheet } from '../../hooks/useBottomSheet';");
        expect(src('src/hooks/useBottomSheet.js')).toContain('if (y > 70 || vy > 0.35 || y + vy * 150 > 100) {');
    });

    it('ningún campo de texto baja de 1rem y el nombre no lleva la flecha del desplegable', () => {
        const css = src('src/components/dashboard/ScanMealModal.module.css');
        expect(regla(css, '.textInput')).toContain('font-size: 1rem;');
        expect(regla(css, '.textInput')).not.toContain('background-image');
        expect(regla(css, '.componentQty')).toContain('font-size: 1rem;');
        expect(css).not.toContain('.selectInput');
    });
});

describe('la revisión como cuatro preguntas', () => {
    it('sin desplegables: tipo de comida y día son chips, y «Hoy» va marcado por defecto', async () => {
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        await llegarARevision();
        for (const q of ['¿Qué es?', '¿Cuánto comiste?', '¿Qué comida es?', '¿Cuándo?']) {
            expect(screen.getByText(q)).toBeInTheDocument();
        }
        expect(screen.queryByRole('combobox')).toBeNull();
        expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Yuca con chicharrón y huevo frito');
    });

    it('«Ayer» manda days_ago=1 y el aviso dice que quedó en el diario de ayer', async () => {
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        await llegarARevision();
        fireEvent.click(screen.getByRole('button', { name: 'Ayer' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cena' }));
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/ }));
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledWith('/api/diary/consumed', expect.objectContaining({ method: 'POST' })), ESPERA);
        const body = JSON.parse(fetchWithAuth.mock.calls.find((c) => c[0] === '/api/diary/consumed')[1].body);
        expect(body.days_ago).toBe(1);
        expect(body.meal_type).toBe('cena');
        await waitFor(() => expect(toast.success).toHaveBeenCalled(), ESPERA);
        expect(toast.success.mock.calls[0][1].description).toContain('Quedó en el diario de ayer; la ves en «Ver días anteriores».');
    });

    it('hoy manda days_ago=0 y el aviso no habla de otro día', async () => {
        render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
        await llegarARevision();
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/ }));
        await waitFor(() => expect(toast.success).toHaveBeenCalled(), ESPERA);
        const body = JSON.parse(fetchWithAuth.mock.calls.find((c) => c[0] === '/api/diary/consumed')[1].body);
        expect(body.days_ago).toBe(0);
        expect(toast.success.mock.calls[0][1]).toBeUndefined();
    });
});
