/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] Perfil Clínico: números con coma, la unidad del peso, mínimo ≤ máximo y un 422 que
 * ya no bloquea el panel entero.
 *
 *   · Los campos eran `type="number"`: en francés, italiano y portugués la coma es el separador decimal y un input
 *     numérico que recibe «5,4» entrega '' — el dato se perdía EN SILENCIO.
 *   · La unidad del historial de peso nacía en 'lb' para todos, ignorando la del perfil.
 *   · El endpoint REEMPLAZA el perfil clínico completo: un solo número fuera de rango hacía fallar cada PUT, con un
 *     toast genérico y sin decir cuál. Ahora ese campo se marca en línea y lo demás se guarda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import ClinicalProfilePanel from '../components/settings/ClinicalProfilePanel';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(), api: (p) => p }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ENDPOINT = '/api/user/preferences/clinical-profile';
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const ESPERA = { timeout: 4000 };

/** Servidor de mentira: GET devuelve `perfil`; PUT pasa por `alGuardar` (por defecto, eco). */
function servidor(perfil = {}, alGuardar = null) {
    const puts = [];
    fetchWithAuth.mockImplementation(async (url, opts) => {
        if (url !== ENDPOINT) return respuesta({});
        if (opts?.method === 'PUT') {
            const body = JSON.parse(opts.body);
            puts.push(body);
            if (alGuardar) return alGuardar(body, puts.length);
            return respuesta({ clinical_profile: body });
        }
        return respuesta({ clinical_profile: perfil });
    });
    return puts;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('[718] coma decimal', () => {
    it('«5,4» se guarda como 5.4 (y el campo sigue mostrando lo que escribiste)', async () => {
        const puts = servidor({});
        const user = userEvent.setup();
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });

        const hba1c = await screen.findByLabelText('HbA1c (%)');
        expect(hba1c).toHaveAttribute('type', 'text');
        expect(hba1c).toHaveAttribute('inputmode', 'decimal');
        await user.type(hba1c, '5,4');
        expect(hba1c).toHaveValue('5,4');

        await waitFor(() => expect(puts.length, 'no salió ningún PUT').toBeGreaterThan(0), ESPERA);
        expect(puts[puts.length - 1].labs.hba1c).toBe(5.4);
    });

    it('lo que no es un número no se cuela: letras y símbolos fuera', async () => {
        servidor({});
        const user = userEvent.setup();
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });
        const ldl = await screen.findByLabelText('LDL (mg/dL)');
        await user.type(ldl, '1a0 0');
        expect(ldl).toHaveValue('100');
    });
});

describe('[718] la unidad del peso nace de la del perfil', () => {
    it('perfil en kg ⇒ el historial de peso empieza en kg', async () => {
        servidor({});
        render(<ClinicalProfilePanel />, {
            customContext: { updateData: vi.fn(), userProfile: { health_profile: { weightUnit: 'kg' } } },
        });
        const kg = await screen.findByRole('button', { name: 'KG' });
        expect(kg).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'LB' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByLabelText('Peso máximo (kg)')).toBeInTheDocument();
    });

    it('pesos ya guardados en lb conservan su unidad aunque el perfil diga kg', async () => {
        servidor({ weightHistory: { unit: 'lb', maxWeight: 210 } });
        render(<ClinicalProfilePanel />, {
            customContext: { updateData: vi.fn(), userProfile: { health_profile: { weightUnit: 'kg' } } },
        });
        expect(await screen.findByLabelText('Peso máximo (lb)')).toHaveValue('210');
    });
});

describe('[718] mínimo ≤ máximo', () => {
    it('mínimo por encima del máximo: aviso en línea, esos dos no viajan, lo demás SÍ se guarda', async () => {
        const puts = servidor({});
        const user = userEvent.setup();
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });

        await user.type(await screen.findByLabelText('Peso máximo (lb)'), '150');
        const minimo = screen.getByLabelText('Peso mínimo (adulto) (lb)');
        await user.type(minimo, '200');
        await user.type(screen.getByLabelText('HbA1c (%)'), '5.4');
        await user.tab();   // salir de los campos

        await waitFor(() => expect(puts.length).toBeGreaterThan(0), ESPERA);
        const ultimo = puts[puts.length - 1];
        expect(ultimo.labs.hba1c, 'un peso imposible bloqueó el guardado de todo lo demás').toBe(5.4);
        expect(ultimo.weightHistory.minWeight).toBe('');
        expect(ultimo.weightHistory.maxWeight).toBe('');

        await user.click(minimo);
        await user.tab();
        expect(await screen.findByText(/El peso mínimo no puede ser mayor que el máximo/)).toBeInTheDocument();
        expect(minimo).toHaveAttribute('aria-invalid', 'true');
    });
});

describe('[718] un 422 marca el campo y deja guardar lo demás', () => {
    it('el servidor rechaza HbA1c: se marca en línea y el PUT se repite sin él, con el TFG dentro', async () => {
        const puts = servidor({}, (body) => (body.labs && body.labs.hba1c !== undefined
            ? respuesta({ detail: "'hba1c' fuera de rango plausible (3.0-15.0). ¿Typo?" }, false, 422)
            : respuesta({ clinical_profile: body })));
        const user = userEvent.setup();
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });

        await user.type(await screen.findByLabelText('HbA1c (%)'), '10');
        await user.type(screen.getByLabelText('TFG (filtrado renal) (mL/min)'), '95');

        await waitFor(() => expect(puts.some((b) => b.labs.hba1c === undefined && b.labs.tfg === 95)).toBe(true), ESPERA);
        expect(await screen.findByText(/Este valor no se pudo guardar; revísalo/)).toBeInTheDocument();
        expect(screen.getByLabelText('HbA1c (%)')).toHaveAttribute('aria-invalid', 'true');
        expect(toast.error, 'el 422 atribuible a un campo salió como toast genérico').not.toHaveBeenCalled();
    });

    it('un 422 SIN campo reconocible sigue avisando (y no se adopta como guardado)', async () => {
        servidor({}, () => respuesta({ detail: 'Payload inválido.' }, false, 422));
        const user = userEvent.setup();
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });
        await user.type(await screen.findByLabelText('HDL (mg/dL)'), '50');
        await waitFor(() => expect(toast.error).toHaveBeenCalled(), ESPERA);
    });
});

describe('[718] formData al día al CARGAR', () => {
    it('la copia de `clinical_profile` en formData se actualiza con lo que dice el servidor', async () => {
        const perfil = { labs: { hba1c: 5.4 }, giSymptoms: ['reflujo'] };
        servidor(perfil);
        const updateData = vi.fn();
        render(<ClinicalProfilePanel />, {
            customContext: { updateData, formData: { clinical_profile: { labs: { hba1c: 9.9 } } } },
        });
        await waitFor(() => expect(updateData).toHaveBeenCalledWith('clinical_profile', perfil), ESPERA);
    });

    it('si ya coincide, no la toca (updateData marca la clave como editada)', async () => {
        const perfil = { labs: { hba1c: 5.4 } };
        servidor(perfil);
        const updateData = vi.fn();
        render(<ClinicalProfilePanel />, { customContext: { updateData, formData: { clinical_profile: perfil } } });
        await screen.findByLabelText('HbA1c (%)');
        expect(updateData).not.toHaveBeenCalled();
    });
});

describe('[718] accesibilidad', () => {
    it('cada sección es un grupo con nombre y los chips de unidad dicen si están pulsados', async () => {
        servidor({});
        render(<ClinicalProfilePanel />, { customContext: { updateData: vi.fn() } });
        expect(await screen.findByRole('group', { name: 'Laboratorios recientes' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Historial de peso' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Digestión' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Entrenamiento' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Unidad de peso' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'LB' })).toHaveAttribute('aria-pressed');
    });
});
