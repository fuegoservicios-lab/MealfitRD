/**
 * [P1-PLAN-LOTE-846 · 2026-09-29] Recordatorios médicos visibles (Apple 1.4.1; auditoría fila 7.1, §A.4).
 *
 * Antes solo había recordatorio si el usuario declaraba algo, y el banner de revisión profesional se podía cerrar del
 * todo. Ahora, siempre:
 *  1. al final del formulario, en las dos ramas (plan y contador), la línea de la hoja del permiso;
 *  2. bajo el cuadro del coach, «El coach es una IA…»;
 *  3. en el plan y en el contador, una nota fija con enlace al Aviso Médico (`apexUrl('/medical')`);
 *  4. el banner de revisión profesional, al cerrarlo, deja una versión compacta fija.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, cleanup, fireEvent } from './utils/test-utils';
import InteractiveAssessmentFlow from '../components/assessment/InteractiveAssessmentFlow';
import NotaAvisoMedico from '../components/common/NotaAvisoMedico';
import AvisoRevisionCompacto from '../components/dashboard/AvisoRevisionCompacto';
import { REQUIRED_FORM_FIELDS } from '../config/formValidation';
import { apexUrl } from '../config/site';
import { fetchWithAuth } from '../config/api';

vi.mock('react-router-dom', async () => {
    const real = await vi.importActual('react-router-dom');
    return { ...real, useNavigate: () => vi.fn() };
});
vi.mock('../config/api', async (importOriginal) => ({ ...(await importOriginal()), fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

const SRC = resolve(__dirname, '..');
const leer = (rel) => readFileSync(resolve(SRC, rel), 'utf8').split(String.fromCharCode(13)).join('');
const LINEA_FORMULARIO = /^Bioboros no sustituye a tu médico ni a tu nutricionista\. Consúltales antes de cambiar tu alimentación/;
const _ARRAYS = new Set(['allergies', 'dislikes', 'medicalConditions', 'struggles', 'cultureProfiles']);
const FORM_COMPLETO = Object.fromEntries(REQUIRED_FORM_FIELDS.map((c) => [c, _ARRAYS.has(c) ? ['Ninguna'] : 'x']));

const contexto = (extra = {}) => ({
    currentStep: 0, maxReachedStep: 0, planData: null, formData: { ...FORM_COMPLETO, age: '30' },
    setCurrentStep: vi.fn(), setMaxReachedStep: vi.fn(), nextStep: vi.fn(), prevStep: vi.fn(), updateData: vi.fn(),
    resetApp: vi.fn(), exitGuestSession: vi.fn(), loadingSensitive: false, isGuest: true, userProfile: null,
    session: null, ...extra,
});

const totalDePasos = (extra) => {
    const { unmount } = render(<InteractiveAssessmentFlow />, { customContext: contexto(extra) });
    const total = Number(document.body.textContent.match(/PASO\s+\d+\s+DE\s+(\d+)/i)[1]);
    unmount();
    return total;
};

beforeEach(() => { localStorage.clear(); fetchWithAuth.mockReset(); });
afterEach(() => cleanup());

describe('[P1-PLAN-LOTE-846] 1 · al final del formulario, en las dos ramas', () => {
    it('rama del plan: la línea sale en el último paso y no en el primero', () => {
        const total = totalDePasos();
        render(<InteractiveAssessmentFlow />, { customContext: contexto({ currentStep: total - 1, maxReachedStep: total - 1 }) });
        expect(screen.getByTestId('wizard-aviso-medico').textContent).toMatch(LINEA_FORMULARIO);
        cleanup();
        render(<InteractiveAssessmentFlow />, { customContext: contexto() });
        expect(screen.queryByTestId('wizard-aviso-medico')).toBeNull();
    });

    it('rama del contador: la línea sale en su cierre («Empezar a contar»)', () => {
        const extra = { isGuest: false, session: { user: { id: 'u1' } }, formData: { ...FORM_COMPLETO, age: '30', appMode: 'tracking' } };
        const total = totalDePasos(extra);
        render(<InteractiveAssessmentFlow />, { customContext: contexto({ ...extra, currentStep: total - 1, maxReachedStep: total - 1 }) });
        expect(screen.getByRole('button', { name: /Empezar a contar/ })).toBeInTheDocument();
        expect(screen.getByTestId('wizard-aviso-medico').textContent).toMatch(LINEA_FORMULARIO);
    });

    it('es la MISMA clave que la hoja del permiso (una traducción, no dos)', () => {
        const hoja = leer('consent/textoDeLaHoja.js');
        const flujo = leer('components/assessment/InteractiveAssessmentFlow.jsx');
        const clave = "'{app} no sustituye a tu médico ni a tu nutricionista.";
        expect(hoja).toContain(clave);
        expect(flujo).toContain(clave);
    });
});

describe('[P1-PLAN-LOTE-846] 2 · bajo el cuadro del coach', () => {
    it('la línea vive dentro de renderInputArea, después de la caja de escribir', () => {
        const src = leer('pages/AgentPage.jsx');
        const i = src.indexOf('const renderInputArea = (isCentered = false) => (');
        const fin = src.indexOf('Reproductor Nativo', i);
        const bloque = src.slice(i, fin);
        const caja = bloque.indexOf('className="input-box-dictable"');
        const linea = bloque.indexOf("t('El coach es una IA: puede equivocarse y no sustituye el consejo médico.')");
        expect(caja).toBeGreaterThan(-1);
        expect(linea).toBeGreaterThan(caja);
        // 12 px y el gris con información (--text-muted), no el de adorno
        expect(bloque.slice(linea - 400, linea)).toMatch(/fontSize: '0\.75rem'[\s\S]*color: 'var\(--text-muted\)'/);
    });
});

describe('[P1-PLAN-LOTE-846] 3 · nota fija en el plan y en el contador', () => {
    it('la nota enlaza el Aviso Médico por apexUrl y se abre aparte', () => {
        render(<NotaAvisoMedico />);
        const nota = screen.getByTestId('nota-aviso-medico');
        expect(nota.textContent).toMatch(/Bioboros no sustituye el consejo médico\. Consulta a tu médico/);
        const enlace = screen.getByRole('link', { name: 'Aviso médico' });
        expect(enlace.getAttribute('href')).toBe(apexUrl('/medical'));
        expect(enlace.getAttribute('target')).toBe('_blank');
        expect(enlace.getAttribute('rel')).toMatch(/noopener/);
        expect(screen.queryByRole('button')).toBeNull();   // fija: no se cierra
    });

    it('la montan el plan (Dashboard) y el contador (DashboardTracking), sin condición', () => {
        for (const f of ['pages/Dashboard.jsx', 'components/dashboard/DashboardTracking.jsx']) {
            const src = leer(f);
            expect(src, f).toMatch(/import NotaAvisoMedico from '[./]+(components\/)?common\/NotaAvisoMedico'/);
            const k = src.indexOf('<NotaAvisoMedico />');
            expect(k, f).toBeGreaterThan(-1);
            // no va dentro de un `cond && (` en la misma línea
            const linea = src.slice(src.lastIndexOf('\n', k), k);
            expect(linea, f).not.toMatch(/&&/);
        }
    });

    it('la nota de la pantalla usa `apexUrl`, que en nativo resuelve la variante de la app (lote 845)', () => {
        expect(leer('components/common/NotaAvisoMedico.jsx')).toMatch(/href=\{apexUrl\('\/medical'\)\}/);
    });
});

describe('[P1-PLAN-LOTE-846] 4 · el banner de revisión profesional no desaparece', () => {
    const src = leer('pages/Dashboard.jsx');

    it('cerrado, el Dashboard monta la versión compacta con «Ver aviso» → showProReview', () => {
        expect(src).toMatch(/&& proReviewHidden && \(\s*<AvisoRevisionCompacto renal=\{!!planData\.requires_professional_review\.renal_gate\} onVerAviso=\{showProReview\} \/>/);
    });

    it('desplegarlo borra la marca de «cerrado» del plan', () => {
        const k = src.indexOf('const showProReview = useCallback(');
        expect(src.slice(k, k + 400)).toMatch(/setProReviewHidden\(false\)[\s\S]*safeLocalStorageRemove\(key\)/);
    });

    it('[ronda 1] render: la línea compacta no tiene X, dice qué hacer y «Ver aviso» la vuelve a abrir', () => {
        const onVerAviso = vi.fn();
        render(<AvisoRevisionCompacto onVerAviso={onVerAviso} />);
        const nota = screen.getByTestId('pro-review-compacto');
        expect(nota.textContent).toContain('Consulta a tu profesional de salud antes de seguir este plan.');
        expect(screen.getAllByRole('button')).toHaveLength(1);   // solo «Ver aviso»: nada que la cierre
        fireEvent.click(screen.getByRole('button', { name: 'Ver aviso' }));
        expect(onVerAviso).toHaveBeenCalledTimes(1);
        cleanup();
        render(<AvisoRevisionCompacto renal onVerAviso={onVerAviso} />);
        expect(screen.getByTestId('pro-review-compacto').textContent)
            .toContain('Condición renal — este plan requiere supervisión de tu nefrólogo');
    });
});
