// [P1-PLAN-LOTE-223 · 2026-09-24] El escáner de comida, reconstruido.
//
// Un tester de Android, con captura de «Revisa y registra»: «no me deja quitar el 0 para agregar otro número… no puedo
// agregar cantidades por culpa del 0». El dueño, encima: «también debería poder mandarse platos múltiples como en el
// agente IA chat… hazlo lo mejor y más cómodo posible para el usuario».
//
// Lo que este archivo vigila:
//   1. La cantidad: borrar deja el campo VACÍO (no «0»), lo escrito es lo que queda («10», no «010»), la coma decimal
//      vale, y los botones −/+ dan pasos con sentido para la unidad.
//   2. Las macros siguen a los ingredientes cuando el servidor manda lo que aporta cada uno; una corrección a mano
//      sobrevive a desmarcar un ingrediente; sin desglose, manda el total de la foto como siempre.
//   3. Varios platos: hasta 4 fotos, cada una por su cuenta (una que falla no tumba a las demás), un registro en serie
//      que no duplica lo que ya quedó si algo falla a medias, y nombres repetidos que no se come el anti doble toque.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ScanMealModal from '../components/dashboard/ScanMealModal';
import QuantityStepper from '../components/common/QuantityStepper';
import {
    leerCantidad, esCantidadEnCurso, pasoDeCantidad, redondearCantidad, formatearCantidad, cantidadParaServidor,
    unidadParaCantidad, minimoDeCantidad, topeDeCantidad,
} from '../utils/cantidadIngrediente';
import {
    platoDesdeAnalisis, macrosDelPlato, conMacroTecleada, conPorcion, conCantidad, conComponenteAlternado,
    ingredientesParaGuardar, nombresSinRepetir, totalesDe, kcalDelComponente, MAX_PLATOS, PORCIONES,
} from '../components/dashboard/scanMealDishes';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import { isNativeApp } from '../config/platform';
import { chooseNativeGalleryImages } from '../utils/nativeChatImagePicker';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('../components/common/CameraViewfinder', () => ({ default: () => null }));
vi.mock('../config/platform', () => ({ isNativeApp: vi.fn(() => false) }));
vi.mock('../utils/observability', () => ({ captureException: vi.fn() }));
vi.mock('../utils/nativeChatImagePicker', () => ({
    chooseNativeGalleryImages: vi.fn(),
    isNativePickerCancellation: (e) => `${e?.code || ''} ${e?.message || ''}`.toLowerCase().includes('cancel'),
}));

const leer = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
// El código sin sus comentarios: la prosa que CUENTA el defecto («era `type="number"`») no es el defecto.
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Lo que manda el servidor tras el lote 223: cada componente con su parte, que suma exactamente el total.
const ESPAGUETIS = {
    success: true, is_food: true, photo_kind: 'plato', meal_name: 'Espaguetis con albóndigas',
    macros: { calories: 900, protein: 45, carbs: 100, healthy_fats: 35 },
    items: [
        { name: 'espaguetis en salsa', quantity: 2, unit: 'taza', macros: { calories: 466, protein: 15, carbs: 88, healthy_fats: 6.4 } },
        { name: 'albóndigas', quantity: 4, unit: 'unidad', macros: { calories: 402, protein: 28, carbs: 12, healthy_fats: 26.5 } },
        { name: 'queso rallado', quantity: 1, unit: 'cucharada', macros: { calories: 32, protein: 2, carbs: 0, healthy_fats: 2.1 } },
    ],
};
// Un servidor anterior (o un plato que la IA no supo repartir): componentes SIN `macros`.
const SIN_DESGLOSE = {
    success: true, is_food: true, photo_kind: 'plato', meal_name: 'Mangú con los tres golpes',
    macros: { calories: 750, protein: 35, carbs: 80, healthy_fats: 30 },
    items: [{ name: 'huevo', quantity: 2, unit: 'unidad' }, { name: 'queso frito', quantity: 2, unit: 'lasca' }],
};
const JUGO = {
    success: true, is_food: true, photo_kind: 'plato', meal_name: 'Jugo de chinola',
    macros: { calories: 140, protein: 1, carbs: 34, healthy_fats: 0 }, items: [],
};
const COMPRA = { success: true, is_food: true, photo_kind: 'items', items: [] };
const CAIDO = { success: true, is_food: false, analysis_failed: true, photo_kind: 'otro', items: [] };

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

let colaAnalisis;
let consumidas;
let fallanUnaVez;

// jsdom no carga imágenes ni dispara onerror: el mismo FakeImage de ScanMealModal.photo_deducts (patrón del repo).
class FakeImage {
    constructor() { this.width = 1920; this.height = 1080; this._src = ''; }
    set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
    get src() { return this._src; }
}

beforeEach(() => {
    colaAnalisis = [];
    consumidas = [];
    fallanUnaVez = new Set();
    vi.mocked(isNativeApp).mockReturnValue(false);
    vi.mocked(chooseNativeGalleryImages).mockReset();
    Object.values(toast).forEach((f) => f.mockReset());
    global.Image = FakeImage;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb, type) {
        cb(new Blob(['fake-bytes'], { type: type || 'image/jpeg' }));
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = vi.fn();
    vi.mocked(fetchWithAuth).mockReset();
    vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
        if (url === '/api/diary/upload') return respuesta(colaAnalisis.length ? colaAnalisis.shift() : ESPAGUETIS);
        if (url === '/api/diary/consumed' && opts?.method === 'POST') {
            const b = JSON.parse(opts.body);
            consumidas.push(b);
            if (fallanUnaVez.has(b.meal_name)) {
                fallanUnaVez.delete(b.meal_name);
                return respuesta({ detail: 'boom' }, 500);
            }
            return respuesta({ success: true, already_logged: false, deducted: [], inferred: [], not_in_pantry: [] });
        }
        return respuesta({});
    });
});

const foto = (n = 'plato.jpg') => new File(['x'], n, { type: 'image/jpeg' });
const elegir = (...files) => {
    const inputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[inputs.length - 1], { target: { files } });
};
const abrir = () => render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
const macro = (nombre) => screen.getByLabelText(new RegExp(`^${nombre}`));

// ─────────────────────────────── 1. la cantidad ───────────────────────────────

describe('lote 223 · leer y mover una cantidad', () => {
    it('lee lo que la gente teclea: coma o punto, fracciones; lo demás no es un número', () => {
        expect(leerCantidad('10')).toBe(10);
        expect(leerCantidad('1,5')).toBe(1.5);
        expect(leerCantidad('1.5')).toBe(1.5);
        expect(leerCantidad('.5')).toBe(0.5);
        expect(leerCantidad('1/2')).toBe(0.5);
        expect(leerCantidad('1 1/2')).toBe(1.5);
        expect(leerCantidad('0')).toBe(0);
        expect(leerCantidad('')).toBeNull();
        expect(leerCantidad('abc')).toBeNull();
        expect(leerCantidad('1/0')).toBeNull();
        // a medio escribir se deja escribir; la basura no entra al campo
        expect(esCantidadEnCurso('1,')).toBe(true);
        expect(esCantidadEnCurso('')).toBe(true);
        expect(esCantidadEnCurso('1,5,')).toBe(false);
        expect(esCantidadEnCurso('dos')).toBe(false);
        expect(esCantidadEnCurso('12345678')).toBe(false);
    });

    it('−/+ con pasos que tienen sentido para la unidad', () => {
        // piezas: media por debajo de una, de una en una por encima; salta al múltiplo
        expect(pasoDeCantidad(1, 'unidad', 1)).toBe(2);
        expect(pasoDeCantidad(1, 'unidad', -1)).toBe(0.5);
        expect(pasoDeCantidad(0.5, 'unidad', 1)).toBe(1);
        expect(pasoDeCantidad(1.5, 'lasca', 1)).toBe(2);
        expect(pasoDeCantidad(1.5, 'lasca', -1)).toBe(1);
        // tazas: de media en media, un cuarto por debajo de la media
        expect(pasoDeCantidad(1, 'taza', -1)).toBe(0.5);
        expect(pasoDeCantidad(0.5, 'taza', -1)).toBe(0.25);
        expect(pasoDeCantidad(0.25, 'taza', 1)).toBe(0.5);
        // gramos: de 10 en 10, de 25 desde 100, de 50 desde 500
        expect(pasoDeCantidad(95, 'g', 1)).toBe(100);
        expect(pasoDeCantidad(100, 'g', 1)).toBe(125);
        expect(pasoDeCantidad(100, 'g', -1)).toBe(90);
        expect(pasoDeCantidad(500, 'g', 1)).toBe(550);
        expect(pasoDeCantidad(0.5, 'lb', 1)).toBe(0.75);
        // topes
        expect(minimoDeCantidad('unidad')).toBe(0.5);
        expect(pasoDeCantidad(99, 'unidad', 1)).toBe(topeDeCantidad('unidad'));
        expect(pasoDeCantidad(5, 'g', -1)).toBe(minimoDeCantidad('g'));
    });

    it('redondea lo calculado, pinta sin ceros de más y viaja con punto', () => {
        expect(redondearCantidad(1.5 * 1, 'lasca')).toBe(1.5);
        expect(redondearCantidad(0.5 * 1.5, 'taza')).toBe(0.75);
        expect(redondearCantidad(150 * 1.5, 'g')).toBe(225);
        expect(formatearCantidad(2)).toBe('2');
        expect(cantidadParaServidor(1.5)).toBe('1.5');
        expect(cantidadParaServidor(2)).toBe('2');
        // la unidad con su número, para pintar (el dato no se toca)
        expect(unidadParaCantidad('taza', 2)).toBe('tazas');
        expect(unidadParaCantidad('taza', 1)).toBe('taza');
        expect(unidadParaCantidad('unidad', 3)).toBe('unidades');
        expect(unidadParaCantidad('porción', 2)).toBe('porciones');
        expect(unidadParaCantidad('g', 200)).toBe('g');
        expect(unidadParaCantidad('lb', 2)).toBe('lb');
    });
});

describe('lote 223 · QuantityStepper', () => {
    const pintar = (props = {}) => {
        const onChange = vi.fn();
        const utils = render(<QuantityStepper value={4} unit="unidad" nombre="albóndigas" onChange={onChange}
            classes={{ wrap: 'w', btn: 'b', input: 'i' }} {...props} />);
        return { onChange, campo: screen.getByLabelText('Cantidad de albóndigas'), ...utils };
    };

    it('es un campo de texto con teclado decimal (no `type="number"`)', () => {
        const { campo } = pintar();
        expect(campo).toHaveAttribute('type', 'text');
        expect(campo).toHaveAttribute('inputmode', 'decimal');
    });

    it('EL DEFECTO: borrar deja el campo vacío y lo escrito es lo que queda (no «010»)', () => {
        const { campo, onChange } = pintar();
        fireEvent.change(campo, { target: { value: '' } });
        expect(campo).toHaveValue('');
        expect(onChange).not.toHaveBeenCalled();   // el vacío no es una cantidad
        fireEvent.change(campo, { target: { value: '10' } });
        expect(campo).toHaveValue('10');
        expect(onChange).toHaveBeenLastCalledWith(10);
    });

    it('al salir vacío vuelve la última cantidad buena; la basura ni se escribe', () => {
        const { campo } = pintar();
        fireEvent.change(campo, { target: { value: '' } });
        fireEvent.blur(campo);
        expect(campo).toHaveValue('4');
        fireEvent.change(campo, { target: { value: 'x' } });
        expect(campo).toHaveValue('4');
    });

    it('los botones: pasos por unidad, «−» apagado en el mínimo', () => {
        const { onChange } = pintar({ value: 0.5 });
        expect(screen.getByRole('button', { name: 'Menos albóndigas' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Más albóndigas' }));
        expect(onChange).toHaveBeenLastCalledWith(1);
    });
});

// ─────────────────────────── 2. la cuenta de un plato ──────────────────────────

describe('lote 223 · la cuenta de un plato (scanMealDishes)', () => {
    it('con desglose, las macros SALEN de los ingredientes', () => {
        const p = platoDesdeAnalisis(ESPAGUETIS);
        expect(p.desglose).toBe(true);
        expect(macrosDelPlato(p)).toEqual({ calories: 900, protein: 45, carbs: 100, healthy_fats: 35 });
        const sinAlbondigas = conComponenteAlternado(p, '1');
        expect(macrosDelPlato(sinAlbondigas).calories).toBe(498);
        const la_mitad = conCantidad(p, '0', 1);   // 1 taza de espaguetis en vez de 2
        expect(macrosDelPlato(la_mitad).calories).toBe(667);
        expect(kcalDelComponente(la_mitad.componentes[0])).toBe(233);
    });

    it('una corrección a mano sobrevive a desmarcar un ingrediente (se guarda como diferencia)', () => {
        const p = conMacroTecleada(platoDesdeAnalisis(ESPAGUETIS), 'calories', '800');
        expect(macrosDelPlato(p).calories).toBe(800);
        expect(macrosDelPlato(conComponenteAlternado(p, '2')).calories).toBe(768);
    });

    it('una porción reescala las cantidades desde lo detectado y descarta lo corregido a mano', () => {
        expect(PORCIONES).toEqual([0.5, 1, 1.5, 2]);
        const p = conPorcion(conMacroTecleada(platoDesdeAnalisis(ESPAGUETIS), 'calories', '800'), 1.5);
        expect(p.componentes.map((c) => c.qty)).toEqual([3, 6, 1.5]);
        expect(macrosDelPlato(p).calories).toBe(1350);
        expect(ingredientesParaGuardar(p)).toEqual(['3 taza de espaguetis en salsa', '6 unidad de albóndigas', '1.5 cucharada de queso rallado']);
    });

    it('sin desglose manda el total de la foto por la porción; el ingrediente no lo mueve', () => {
        const p = platoDesdeAnalisis(SIN_DESGLOSE);
        expect(p.desglose).toBe(false);
        expect(macrosDelPlato(conComponenteAlternado(p, '0')).calories).toBe(750);
        expect(macrosDelPlato(conPorcion(p, 0.5)).calories).toBe(375);
        // la Nevera descuenta lo comido: la porción también reescala las cantidades
        expect(conPorcion(p, 0.5).componentes.map((c) => c.qty)).toEqual([1, 1]);
    });

    it('los nombres repetidos de un mismo registro se numeran; el total suma los platos', () => {
        expect(nombresSinRepetir(['Jugo de chinola', 'jugo de chinola ', 'Café'])).toEqual(['Jugo de chinola', 'jugo de chinola (2)', 'Café']);
        expect(totalesDe([platoDesdeAnalisis(ESPAGUETIS), platoDesdeAnalisis(JUGO)]).calories).toBe(1040);
        expect(MAX_PLATOS).toBe(4);
    });
});

// ──────────────────────────────── 3. el escáner ────────────────────────────────

describe('lote 223 · un plato', () => {
    it('EL DEFECTO, en el escáner: borrar, escribir 10 y que viajen 10 albóndigas', async () => {
        abrir();
        elegir(foto());
        const campo = await screen.findByLabelText('Cantidad de albóndigas');
        fireEvent.change(campo, { target: { value: '' } });
        expect(campo).toHaveValue('');
        fireEvent.change(campo, { target: { value: '10' } });
        expect(campo).toHaveValue('10');
        expect(macro('Calorías')).toHaveValue(1503);   // 466 + 402·10/4 + 32
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/ }));
        await waitFor(() => expect(consumidas).toHaveLength(1));
        expect(consumidas[0].ingredients).toContain('10 unidad de albóndigas');
        expect(consumidas[0].calories).toBe(1503);
    });

    it('desmarcar un ingrediente baja las calorías y no lo manda', async () => {
        abrir();
        elegir(foto());
        await screen.findByRole('button', { name: /Registrar comida/ });
        expect(macro('Calorías')).toHaveValue(900);
        expect(screen.getByText('Desmarca lo que no comiste o ajusta la cantidad: las calorías se recalculan solas.')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Incluir albóndigas'));
        expect(macro('Calorías')).toHaveValue(498);
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/ }));
        await waitFor(() => expect(consumidas).toHaveLength(1));
        expect(consumidas[0].calories).toBe(498);
        expect(consumidas[0].ingredients).toEqual(['2 taza de espaguetis en salsa', '1 cucharada de queso rallado']);
    });

    it('los botones −/+ y la coma decimal: «1,5» tazas viaja como «1.5»', async () => {
        abrir();
        elegir(foto());
        await screen.findByRole('button', { name: /Registrar comida/ });
        fireEvent.click(screen.getByRole('button', { name: 'Más albóndigas' }));
        expect(screen.getByLabelText('Cantidad de albóndigas')).toHaveValue('5');
        fireEvent.change(screen.getByLabelText('Cantidad de espaguetis en salsa'), { target: { value: '1,5' } });
        expect(macro('Calorías')).toHaveValue(884);   // 349,5 + 502,5 + 32
        fireEvent.click(screen.getByRole('button', { name: '1½×' }));
        expect(screen.getByLabelText('Cantidad de albóndigas')).toHaveValue('6');
        fireEvent.click(screen.getByRole('button', { name: '1×' }));
        fireEvent.change(screen.getByLabelText('Cantidad de espaguetis en salsa'), { target: { value: '1,5' } });
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/ }));
        await waitFor(() => expect(consumidas).toHaveLength(1));
        expect(consumidas[0].ingredients[0]).toBe('1.5 taza de espaguetis en salsa');
    });

    it('«Volver a escanear» vive sobre la foto y vuelve a elegir', async () => {
        abrir();
        elegir(foto());
        await screen.findByRole('button', { name: /Registrar comida/ });
        fireEvent.click(screen.getByRole('button', { name: /Volver a escanear/ }));
        expect(screen.getByText('Elegir de galería')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Registrar comida/ })).toBeNull();
    });

    it('un análisis caído se puede reintentar con la misma foto', async () => {
        colaAnalisis = [CAIDO, JUGO];
        abrir();
        elegir(foto());
        await screen.findByText('El analizador de imágenes no está disponible ahora mismo. Intenta de nuevo en unos minutos.');
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        await screen.findByRole('button', { name: /Registrar comida/ });
        expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Jugo de chinola');
        expect(vi.mocked(fetchWithAuth).mock.calls.filter(([u]) => u === '/api/diary/upload')).toHaveLength(2);
    });
});

describe('lote 223 · varios platos', () => {
    it('dos fotos a la vez: dos tarjetas, el total en el pie y dos registros en serie con el mismo día y tipo', async () => {
        colaAnalisis = [ESPAGUETIS, JUGO];
        abrir();
        elegir(foto('a.jpg'), foto('b.jpg'));
        const boton = await screen.findByRole('button', { name: /Registrar 2 platos/ });
        expect(screen.getByText(/^2 platos · /)).toBeInTheDocument();
        expect(screen.getByText('La IA estimó esto por las fotos. Corrige lo que no cuadre.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ayer' }));
        fireEvent.click(boton);
        await waitFor(() => expect(consumidas).toHaveLength(2));
        expect(consumidas.map((b) => b.meal_name)).toEqual(['Espaguetis con albóndigas', 'Jugo de chinola']);
        expect(new Set(consumidas.map((b) => b.meal_type)).size).toBe(1);
        expect(consumidas.map((b) => b.days_ago)).toEqual([1, 1]);
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(toast.success.mock.calls[0][0]).toMatch(/^2 platos registrados \(1.040 kcal\)\.$/);
        expect(toast.success.mock.calls[0][1].description).toContain('Quedó en el diario de ayer');
    });

    it('dos platos con el mismo nombre llegan los dos (el anti doble toque del servidor se comería el segundo)', async () => {
        colaAnalisis = [JUGO, JUGO];
        abrir();
        elegir(foto('a.jpg'), foto('b.jpg'));
        fireEvent.click(await screen.findByRole('button', { name: /Registrar 2 platos/ }));
        await waitFor(() => expect(consumidas).toHaveLength(2));
        expect(consumidas.map((b) => b.meal_name)).toEqual(['Jugo de chinola', 'Jugo de chinola (2)']);
    });

    it('una foto que falla no tumba a las demás: dice por qué y se registra lo que sí se analizó', async () => {
        colaAnalisis = [ESPAGUETIS, COMPRA];
        abrir();
        elegir(foto('a.jpg'), foto('b.jpg'));
        await screen.findByText(/Esto parece una compra o alimentos sueltos/);
        expect(await screen.findByText('1 foto sin analizar no se registrará')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/ }));
        await waitFor(() => expect(consumidas).toHaveLength(1));
        expect(consumidas[0].meal_name).toBe('Espaguetis con albóndigas');
    });

    it(`más de ${4} fotos: entran las primeras 4 y se dice; con 4 ya no se ofrece añadir`, async () => {
        colaAnalisis = [JUGO, JUGO, JUGO, JUGO, JUGO];
        abrir();
        elegir(foto('1.jpg'), foto('2.jpg'), foto('3.jpg'), foto('4.jpg'), foto('5.jpg'));
        expect(await screen.findByText('Caben 4 platos por registro: usamos las primeras fotos.')).toBeInTheDocument();
        await screen.findByRole('button', { name: /Registrar 4 platos/ });
        expect(vi.mocked(fetchWithAuth).mock.calls.filter(([u]) => u === '/api/diary/upload')).toHaveLength(4);
        expect(screen.queryByText('¿Comiste algo más?')).toBeNull();
    });

    it('añadir otro plato desde la revisión y quitar uno', async () => {
        colaAnalisis = [ESPAGUETIS, JUGO];
        abrir();
        elegir(foto('a.jpg'));
        await screen.findByRole('button', { name: /Registrar comida/ });
        expect(screen.getByText('¿Comiste algo más?')).toBeInTheDocument();
        elegir(foto('b.jpg'));   // «Añadir otro plato» abre este mismo input
        await screen.findByRole('button', { name: /Registrar 2 platos/ });
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Jugo de chinola' }));
        expect(await screen.findByRole('button', { name: /Registrar comida/ })).toBeInTheDocument();
        expect(screen.queryByText('Jugo de chinola')).toBeNull();
    });

    it('si un registro falla a medias, lo que quedó se marca y el reintento no lo repite', async () => {
        colaAnalisis = [ESPAGUETIS, JUGO];
        fallanUnaVez.add('Jugo de chinola');
        abrir();
        elegir(foto('a.jpg'), foto('b.jpg'));
        fireEvent.click(await screen.findByRole('button', { name: /Registrar 2 platos/ }));
        await screen.findByText(/No pudimos registrar «Jugo de chinola»; los platos anteriores sí quedaron en tu diario\./);
        expect(screen.getByText('Registrado')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/ }));
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(consumidas.map((b) => b.meal_name)).toEqual(['Espaguetis con albóndigas', 'Jugo de chinola', 'Jugo de chinola']);
        expect(toast.success.mock.calls[0][0]).toBe('Jugo de chinola registrada (140 kcal).');
    });

    it('el reintento conserva la numeración: «Jugo de chinola (2)» no vuelve como un segundo «Jugo de chinola»', async () => {
        colaAnalisis = [JUGO, JUGO];
        fallanUnaVez.add('Jugo de chinola (2)');
        abrir();
        elegir(foto('a.jpg'), foto('b.jpg'));
        fireEvent.click(await screen.findByRole('button', { name: /Registrar 2 platos/ }));
        await screen.findByText(/No pudimos registrar «Jugo de chinola \(2\)»/);
        fireEvent.click(screen.getByRole('button', { name: /Registrar comida/ }));
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(consumidas.map((b) => b.meal_name)).toEqual(['Jugo de chinola', 'Jugo de chinola (2)', 'Jugo de chinola (2)']);
    });

    it('la app nativa pide VARIAS fotos, con el hueco que queda', async () => {
        vi.mocked(isNativeApp).mockReturnValue(true);
        vi.mocked(chooseNativeGalleryImages).mockResolvedValueOnce([foto('a.jpg'), foto('b.jpg')]).mockResolvedValueOnce([]);
        colaAnalisis = [ESPAGUETIS, JUGO];
        abrir();
        fireEvent.click(screen.getByText('Elegir de galería'));
        await screen.findByRole('button', { name: /Registrar 2 platos/ });
        expect(chooseNativeGalleryImages).toHaveBeenLastCalledWith(4);
        fireEvent.click(screen.getByRole('button', { name: /Añadir otro plato/ }));
        await waitFor(() => expect(chooseNativeGalleryImages).toHaveBeenLastCalledWith(2));
    });
});

describe('lote 223 · fuente y catálogos', () => {
    it('el escáner usa el campo nuevo, el selector de varias fotos y el interruptor de la Nevera', () => {
        const sm = leer('src/components/dashboard/ScanMealModal.jsx');
        expect(sm).toContain("import QuantityStepper from '../common/QuantityStepper';");
        expect(sinComentarios(sm)).not.toContain('type="number"');
        expect(sm).toContain('chooseNativeGalleryImages(Math.max(1, MAX_PLATOS - platosRef.current.length))');
        expect(sm).toContain('deduct_pantry: descontar,');
        expect(sm).toContain('multiple');
        const qs = leer('src/components/common/QuantityStepper.jsx');
        expect(qs).toContain('type="text"');
        expect(qs).toContain('inputMode="decimal"');
        expect(sinComentarios(qs)).not.toContain('type="number"');
    });

    it('los textos nuevos están en los cuatro catálogos (y los retirados, fuera)', () => {
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(leer(`src/i18n/locales/${loc}.json`));
            for (const k of ['Menos {nombre}', 'Más {nombre}', '¿Comiste algo más?', 'Añadir otro plato', 'Registrar {n} platos',
                '{n} platos registrados ({kcal} kcal).', 'Desmarca lo que no comiste o ajusta la cantidad: las calorías se recalculan solas.',
                '¿Comiste varios platos? Puedes añadir hasta {n}, una foto por plato, y registrarlos juntos.']) {
                expect(cat[k], `${loc}: falta «${k}»`).toBeTruthy();
            }
            for (const k of ['Descontar de tu Nevera', 'Descontar {nombre} de tu Nevera', '{unidad} de {nombre}', 'Estimando las macros…']) {
                expect(cat[k], `${loc}: huérfana «${k}»`).toBeUndefined();
            }
        }
    });
});
