// [P1-PLAN-LOTE-164 · 2026-09-22] El interruptor del generador y el formulario.
//
// 1. En el iPhone del dueño «Generación de planes» no hacía NADA: el diálogo de confirmación no llegaba a verse sobre la
//    ventana de Configuración y su siguiente toque lo cerraba sin verlo (el registro del servidor: ni un paso del
//    formulario llegó a montarse). Encender sin plan ahora abre el formulario directamente.
// 2. Y el formulario pregunta SOLO lo que falta: 26 pasos con 9 ya contestados se vuelven «Pregunta 1 de N».
// 3. Un 422 del servidor dejaba de fingirse «conexión interrumpida · tu plan se sigue generando».
// 4. «Otra condición» / «Otro medicamento» ya no cierran el CONTADOR entero (el alcance clínico es del plan).
// 5. «Tus Medidas» dice qué está mal junto al campo, en vez de apagar «Siguiente» en silencio.
// 6. El selector de idioma del formulario guarda en la cuenta (antes el siguiente arranque lo revertía).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, act, waitFor } from './utils/test-utils';
import { render as renderSinContexto } from '@testing-library/react';
import InteractiveAssessmentFlow from '../components/assessment/InteractiveAssessmentFlow';
import { QMedical, OUT_OF_SCOPE_CONDITION } from '../components/assessment/questions/QMedical';
import { QMeasurements } from '../components/assessment/questions/QMeasurements';
import {
    CLAVE_COMPLETAR, pedirCompletarFormulario, leerCompletarFormulario, fijarPasosCompletar, terminarCompletarFormulario,
} from '../utils/completarFormulario';
import { campoDelRechazo } from '../pages/Plan';
import LocaleSwitcher from '../components/common/LocaleSwitcher';
import { I18nProvider, loadLocale } from '../i18n';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from '../i18n/locales';

const _api = vi.hoisted(() => ({ fetchWithAuth: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })) }));
vi.mock('../config/api', async (importOriginal) => ({ ...(await importOriginal()), fetchWithAuth: _api.fetchWithAuth }));
vi.mock('react-router-dom', async () => {
    const real = await vi.importActual('react-router-dom');
    return { ...real, useNavigate: () => vi.fn() };
});

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

// Lo que la rama corta del contador deja contestado; lo del plan queda AUSENTE (no se inventa).
const FORM_CONTADOR = {
    appMode: 'plan', gender: 'male', age: '34', height: '172', weight: '180', weightUnit: 'lb',
    activityLevel: 'moderate', mainGoal: 'lose_fat', dietType: 'balanced',
    allergies: ['Ninguna'], medicalConditions: ['Ninguna'], country: 'DO',
};

const montarFormulario = (ctx = {}) => render(<InteractiveAssessmentFlow />, {
    customContext: {
        currentStep: 0, maxReachedStep: 0, planData: null, formData: FORM_CONTADOR,
        setCurrentStep: vi.fn(), setMaxReachedStep: vi.fn(), nextStep: vi.fn(), prevStep: vi.fn(),
        updateData: vi.fn(), resetApp: vi.fn(), exitGuestSession: vi.fn(),
        loadingSensitive: false, isGuest: false,
        userProfile: { plan_mode: 'tracking', health_profile: { gender: 'male' } },
        ...ctx,
    },
});

const idsFijados = () => JSON.parse(localStorage.getItem(CLAVE_COMPLETAR) || 'null')?.ids || null;
const kicker = () => screen.getByText(/^Paso \d+ de \d+$/).textContent;

beforeEach(() => {
    localStorage.removeItem(CLAVE_COMPLETAR);
    localStorage.removeItem('mealfit_wizard_step_mode');
    _api.fetchWithAuth.mockClear();
});

describe('lote 164 · la marca «completar lo que falta»', () => {
    it('se pide, se lee, se fija UNA vez y se suelta', () => {
        expect(leerCompletarFormulario()).toBeNull();
        const ahora = Date.now();
        pedirCompletarFormulario(ahora);
        expect(leerCompletarFormulario(ahora + 1000)).toEqual({ pedidoEn: ahora, ids: null });
        expect(fijarPasosCompletar(['planSource', 'habits'])).toEqual(['planSource', 'habits']);
        // fijada: una segunda lista no la pisa (los índices no se mueven bajo los pies del usuario)
        expect(fijarPasosCompletar(['otra'])).toEqual(['planSource', 'habits']);
        terminarCompletarFormulario();
        expect(leerCompletarFormulario()).toBeNull();
    });

    it('caducada (una semana) o rota cuenta como que no hay, y se borra', () => {
        pedirCompletarFormulario(0);
        expect(leerCompletarFormulario(8 * 24 * 3600 * 1000)).toBeNull();
        expect(localStorage.getItem(CLAVE_COMPLETAR)).toBeNull();
        localStorage.setItem(CLAVE_COMPLETAR, '{roto');
        expect(leerCompletarFormulario()).toBeNull();
    });
});

describe('lote 164 · quien viene del contador contesta SOLO lo que falta', () => {
    it('abre en la primera pregunta que falta, cuenta las que faltan y NO repite lo que ya contestó', () => {
        pedirCompletarFormulario();
        montarFormulario();
        // la primera pregunta que la rama corta nunca hizo (no el paso 0 «¿qué quieres que haga…?», ya contestado)
        expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('¿Cómo quieres que la IA arme tu plan?');
        const ids = idsFijados();
        expect(Array.isArray(ids)).toBe(true);
        for (const falta of ['planSource', 'scheduleType', 'sleepHours', 'stressLevel', 'habits', 'cookingTime',
            'groceryDuration', 'budget', 'dislikes', 'stapleFoods', 'struggles', 'motivation']) {
            expect(ids, falta).toContain(falta);
        }
        for (const yaContestado of ['appMode', 'gender', 'age', 'activityLevel', 'mainGoal', 'goalTarget',
            'dietType', 'allergies', 'medicalConditions']) {
            expect(ids, yaContestado).not.toContain(yaContestado);
        }
        // + el paso final (lleva el envío): «Paso 1 de N» y el aviso dicen el mismo N
        const total = ids.length + 1;
        expect(kicker()).toBe(`Paso 1 de ${total}`);
        expect(screen.getByTestId('wizard-completar-aviso').textContent)
            .toContain(`Te faltan ${total} preguntas para tu plan.`);
        expect(screen.getByTestId('wizard-completar-aviso').textContent).toContain('1 crédito');
    });

    it('una condición fuera de alcance entra en la lista: hay que verla ANTES de generar', () => {
        pedirCompletarFormulario();
        montarFormulario({ formData: { ...FORM_CONTADOR, medicalConditions: [OUT_OF_SCOPE_CONDITION] } });
        expect(idsFijados()).toContain('medicalConditions');
    });

    it('«Ver todas las preguntas» suelta el modo y vuelve la rama entera', () => {
        pedirCompletarFormulario();
        montarFormulario();
        fireEvent.click(screen.getByRole('button', { name: 'Ver todas las preguntas' }));
        expect(localStorage.getItem(CLAVE_COMPLETAR)).toBeNull();
        expect(screen.queryByTestId('wizard-completar-aviso')).toBeNull();
        expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('por ti?');
    });

    it('sin la marca, o con un plan vivo (es una edición), el formulario va entero como siempre', () => {
        montarFormulario();
        expect(screen.queryByTestId('wizard-completar-aviso')).toBeNull();
        expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('por ti?');
        pedirCompletarFormulario();
        montarFormulario({ planData: { days: [{ meals: [] }], generation_status: 'complete' } });
        expect(screen.getAllByText(/^Paso 1 de \d+$/).length).toBeGreaterThan(0);
        expect(screen.queryByTestId('wizard-completar-aviso')).toBeNull();
    });

    it('mientras se descifran alergias y condiciones NO fija la lista (las daría por vacías): enseña un cargador', () => {
        pedirCompletarFormulario();
        montarFormulario({ loadingSensitive: true });
        expect(idsFijados()).toBeNull();
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
        expect(screen.getByRole('status', { name: 'Cargando' })).toBeTruthy();
    });
});

describe('lote 164 · «Otra condición» no cierra el contador', () => {
    const montarQ = (appMode) => render(<QMedical onManualAdvance={vi.fn()} />, {
        customContext: { formData: { appMode, medicalConditions: [OUT_OF_SCOPE_CONDITION] }, updateData: vi.fn() },
    });

    it('en la rama del contador avisa de que las metas son orientativas y DEJA seguir', () => {
        montarQ('tracking');
        expect(screen.getByText('Puedes seguir: el contador no aplica reglas clínicas.')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Siguiente/ })).not.toBeDisabled();
    });

    it('en la rama del plan sigue parando: el motor no tiene regla que aplicar', () => {
        montarQ('plan');
        expect(screen.getByText('Todavía no podemos calcular un plan seguro para esa condición.')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Siguiente/ })).toBeDisabled();
    });
});

describe('lote 164 · «Tus Medidas» dice qué está mal', () => {
    const montarM = (formData) => render(<QMeasurements onManualAdvance={vi.fn()} />, {
        customContext: { formData: { age: '30', height: '172', _heightInputUnit: 'cm', weightUnit: 'lb', ...formData }, updateData: vi.fn() },
    });

    it('60 con LB marcado: «¿son kilos?» en vez de un botón apagado sin explicación', () => {
        montarM({ weight: '60' });
        expect(screen.getByRole('alert').textContent).toBe('¿Son kilos? Toca KG: en libras el mínimo es 66.');
    });

    it('un peso válido enseña su equivalencia: «80» pensando en kilos con LB marcado se delata', () => {
        montarM({ weight: '80' });
        expect(screen.getByText(/^≈ 36[.,]3 kg$/)).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('una edad fuera de rango lo dice; un campo vacío no es un error', () => {
        montarM({ age: '11', weight: '' });
        expect(screen.getByRole('alert').textContent).toBe('Escribe una edad entre 12 y 100 años.');
    });

    it('«170» en la casilla de pies: casi seguro son centímetros', () => {
        montarM({ _heightInputUnit: 'ft', height: '', weight: '150' });
        fireEvent.change(screen.getByLabelText('Altura en pies'), { target: { value: '170' } });
        expect(screen.getByRole('alert').textContent).toBe('¿Son centímetros? Toca CM y escríbelo ahí.');
    });
});

describe('lote 164 · un rechazo del servidor no es una conexión cortada', () => {
    it('saca el campo rechazado de las formas reales del backend', () => {
        expect(campoDelRechazo({ code: 'invalid_biometric_range', errors: [{ field: 'targetWeight' }] }, 'invalid_biometric_range')).toBe('targetWeight');
        expect(campoDelRechazo({ code: 'missing_required_fields', missing_fields: ['sleepHours', 'budget'] }, 'missing_required_fields')).toBe('sleepHours');
        expect(campoDelRechazo({ code: 'clinical_scope_exceeded', message: '…' }, 'clinical_scope_exceeded')).toBe('medicalConditions');
        expect(campoDelRechazo({ code: 'invalid_total_days' }, 'invalid_total_days')).toBeUndefined();
        expect(campoDelRechazo('texto', 'x')).toBeUndefined();
    });

    it('el rechazo terminal se atiende ANTES de la rama «tu plan se sigue generando», y limpia la bandera', () => {
        const plan = leer('src/pages/Plan.jsx');
        const i = plan.indexOf('                    if (error.terminal) {');
        const generica = plan.indexOf('let _hasInProgressFlag = false;');
        expect(i).toBeGreaterThan(-1);
        expect(i).toBeLessThan(generica);
        const rama = plan.slice(i, i + 700);
        expect(rama).toContain("safeLocalStorageRemove('mealfit_plan_in_progress');");
        expect(rama).toContain("navigate('/assessment', { replace: true, state: error.field ? { irACampo: error.field } : undefined });");
        expect((plan.match(/\.field = campoDelRechazo\(_detail, /g) || []).length).toBe(2);
    });
});

describe('lote 164 · encender el generador sin plan abre el formulario, sin diálogo de por medio', () => {
    it('Configuración: la rama «sin plan» pide «completar» y navega; ya no pasa por confirmToast', () => {
        const st = leer('src/pages/Settings.jsx');
        const i = st.indexOf('if (!pausing && !planData) {');
        const bloque = st.slice(i, st.indexOf('        if (pausing) {', i));
        expect(bloque).toContain('pedirCompletarFormulario();');
        expect(bloque.indexOf('pedirCompletarFormulario();')).toBeLessThan(bloque.indexOf("navigate('/assessment')"));
        expect(bloque).not.toContain('confirmToast(');
    });

    it('la tarjeta del contador usa la MISMA puerta', () => {
        const dt = leer('src/components/dashboard/DashboardTracking.jsx');
        const i = dt.indexOf('const irAlPlan = () => {');
        const f = dt.slice(i, dt.indexOf('};', i));
        expect(f).toContain('pedirCompletarFormulario();');
        expect(f.indexOf('pedirCompletarFormulario();')).toBeLessThan(f.indexOf("navigate('/assessment')"));
    });

    it('en el teléfono se puede volver al panel desde CUALQUIER paso, no solo desde el primero', () => {
        const l = leer('src/components/assessment/InteractiveAssessmentLayout.jsx');
        const css = leer('src/components/assessment/InteractiveAssessmentLayout.module.css');
        expect(l).toMatch(/currentStep > 0 \? \([\s\S]{0,900}onClick=\{volverAlPanel\}[\s\S]{0,120}styles\.panelMovil/);
        expect(css).toMatch(/@media \(min-width: 769px\) \{\s*\.panelMovil \{\s*display: none;/);
        expect(l).toContain('terminarCompletarFormulario();');
    });
});

describe('lote 164 · el selector de idioma del formulario guarda en la cuenta', () => {
    const matchMedia = vi.fn().mockImplementation((q) => ({
        matches: false, media: q, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    beforeEach(async () => {
        vi.stubGlobal('matchMedia', matchMedia);
        vi.stubGlobal('location', { pathname: '/assessment', hostname: 'app.bioboros.com', protocol: 'https:', href: 'https://app.bioboros.com/assessment' });
        localStorage.removeItem(LOCALE_STORAGE_KEY);
        await loadLocale(DEFAULT_LOCALE);
    });
    afterEach(async () => {
        vi.unstubAllGlobals();
        localStorage.removeItem(LOCALE_STORAGE_KEY);
        await loadLocale(DEFAULT_LOCALE);
    });
    const elegirFrances = async () => {
        fireEvent.click(screen.getByTestId('locale-switcher'));
        await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'Français' })); });
    };

    it('CON cuenta: el cambio viaja al perfil (si no, el siguiente arranque lo revertía)', async () => {
        await act(async () => { renderSinContexto(<I18nProvider><LocaleSwitcher guardarEnCuenta /></I18nProvider>); });
        await elegirFrances();
        await waitFor(() => expect(_api.fetchWithAuth).toHaveBeenCalledTimes(1));
        const [url, opts] = _api.fetchWithAuth.mock.calls[0];
        expect(url).toBe('/api/profile');
        expect(opts.method).toBe('PATCH');
        expect(JSON.parse(opts.body)).toEqual({ fields: { locale: 'fr-FR' } });
    });

    it('SIN cuenta (login, invitado) no hay a quién: nada viaja', async () => {
        await act(async () => { renderSinContexto(<I18nProvider><LocaleSwitcher /></I18nProvider>); });
        await elegirFrances();
        await waitFor(() => expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr-FR'));
        expect(_api.fetchWithAuth).not.toHaveBeenCalled();
    });

    it('el formulario lo monta con `guardarEnCuenta` solo si hay sesión y no es invitado', () => {
        const l = leer('src/components/assessment/InteractiveAssessmentLayout.jsx');
        expect(l).toContain('<LocaleSwitcher id="mf-locale-wizard" menuAlign="start" guardarEnCuenta={!isGuest && Boolean(session)} />');
    });
});
