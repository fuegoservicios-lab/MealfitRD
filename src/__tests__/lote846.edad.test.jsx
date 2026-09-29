/**
 * [P1-PLAN-LOTE-846 · 2026-09-29] Solo mayores de 18 (auditoría App Store, fila 16.2 y §A.9).
 *
 * El formulario aceptaba de 12 a 100 años y mandaba el perfil de salud de un menor a la IA. Ahora:
 *  1. el mínimo es 18 y «menor» se decide en UN sitio (`esMenorDeEdad`, espejo de `edad_minima.py`);
 *  2. en el paso de medidas una edad de menor no se «corrige» junto al campo: corta el formulario (al salir del campo
 *     y en «Siguiente»), borra la edad escrita y no manda nada;
 *  3. el salto, el envío del plan (antes de la hoja del permiso) y el cierre del contador cortan igual;
 *  4. la pantalla del corte ofrece salir o corregir una errata;
 *  5. Configuración valida con el mismo 18, y el 422 `underage` del servidor se traduce.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor, cleanup } from './utils/test-utils';
import InteractiveAssessmentFlow from '../components/assessment/InteractiveAssessmentFlow';
import { QTrackingFinish } from '../components/assessment/questions/QTrackingFinish';
import { REQUIRED_FORM_FIELDS, BIO_RANGES, esMenorDeEdad, motivoEdadNoValida } from '../config/formValidation';
import { mensajeDeError } from '../utils/errorCopy';
import { fetchWithAuth } from '../config/api';
import {
    _reiniciarConsentimientoIAParaTests,
    fijarTitularConsentimientoIA,
    suscribirHojaConsentimientoIA,
} from '../consent/consentimientoIA';

const { navegar } = vi.hoisted(() => ({ navegar: vi.fn() }));
vi.mock('react-router-dom', async () => {
    const real = await vi.importActual('react-router-dom');
    return { ...real, useNavigate: () => navegar };
});
vi.mock('../config/api', async (importOriginal) => ({ ...(await importOriginal()), fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

const SRC = resolve(__dirname, '..');
const leer = (rel) => readFileSync(resolve(SRC, rel), 'utf8').split(String.fromCharCode(13)).join('');
const TITULO_CORTE = 'Bioboros es solo para mayores de 18 años';
const _ARRAYS = new Set(['allergies', 'dislikes', 'medicalConditions', 'struggles', 'cultureProfiles']);
const FORM_COMPLETO = Object.fromEntries(REQUIRED_FORM_FIELDS.map((c) => [c, _ARRAYS.has(c) ? ['Ninguna'] : 'x']));

const contexto = (extra = {}) => ({
    currentStep: 0, maxReachedStep: 0, planData: null, formData: FORM_COMPLETO,
    setCurrentStep: vi.fn(), setMaxReachedStep: vi.fn(), nextStep: vi.fn(), prevStep: vi.fn(), updateData: vi.fn(),
    resetApp: vi.fn(), exitGuestSession: vi.fn(), loadingSensitive: false, isGuest: true, userProfile: null,
    session: null, ...extra,
});

/** Las rutas que salieron hacia el servidor, sin la telemetría propia del formulario. */
const salidas = () => fetchWithAuth.mock.calls.map(([u]) => String(u)).filter((u) => !u.includes('/telemetry/'));

/** El índice del paso «Tus Medidas» y el total de pasos, leídos del propio formulario (no se clavan). */
const pasoDeMedidas = () => {
    const { unmount } = render(<InteractiveAssessmentFlow />, { customContext: contexto() });
    const total = Number(document.body.textContent.match(/PASO\s+\d+\s+DE\s+(\d+)/i)[1]);
    unmount();
    for (let i = 0; i < total; i += 1) {
        const r = render(<InteractiveAssessmentFlow />, { customContext: contexto({ currentStep: i, maxReachedStep: i }) });
        const es = !!screen.queryByLabelText(/Edad \(años\)/i);
        r.unmount();
        if (es) return { indice: i, total };
    }
    throw new Error('no encontré el paso de medidas');
};

beforeEach(() => {
    _reiniciarConsentimientoIAParaTests();
    localStorage.clear();
    fijarTitularConsentimientoIA({ invitado: true });
    navegar.mockReset();
    fetchWithAuth.mockReset();
});
afterEach(() => cleanup());

// ───────────────────────────────────────────── 1. el mínimo y la regla
describe('[P1-PLAN-LOTE-846] 18 y «menor» en un solo sitio', () => {
    it('BIO_RANGES.age va de 18 a 100', () => {
        expect(BIO_RANGES.age.min).toBe(18);
        expect(BIO_RANGES.age.max).toBe(100);
    });

    it.each([17, '17', '1', '15', '17,9', '17.99', 12, ' 16 ', 5.5])('%s es menor', (v) => expect(esMenorDeEdad(v)).toBe(true));
    // [ronda 1] Solo un número LIMPIO, como `edad_minima._EDAD_LIMPIA`: «15 años» no es una edad en ningún lado.
    it.each([18, '18', 30, '100', 0, '0', -3, '0.5', '', null, undefined, 'abc', true, '15 años', '1e1', '15abc', NaN, Infinity])('%s no es menor', (v) => {
        expect(esMenorDeEdad(v)).toBe(false);
    });

    it('Configuración: el menor recibe la frase del corte y la errata un aviso neutro (sin el rango)', () => {
        const t = (k, v = {}) => k.replace(/\{(\w+)\}/g, (_, n) => String(v[n]));
        expect(motivoEdadNoValida('15', t)).toBe(TITULO_CORTE);
        expect(motivoEdadNoValida('250', t)).toBe('Revisa la edad.');
        expect(motivoEdadNoValida('0', t)).toBe('Revisa la edad.');
        expect(motivoEdadNoValida('15 años', t)).toBe('Revisa la edad.');
        expect(motivoEdadNoValida('30', t)).toBeNull();
        expect(motivoEdadNoValida('', t)).toBeNull();
    });

    it('Configuración usa la regla en sus tres guardados y el campo empieza en 18', () => {
        const src = leer('pages/Settings.jsx');
        expect((src.match(/motivoEdadNoValida\(ageInput, t\)/g) || []).length).toBe(3);
        expect(src).not.toMatch(/ageNum < 12/);
        expect(src).not.toMatch(/min=\{BIO_RANGES\.age\.min\}/);   // [ronda 1] el campo no revela el umbral
    });

    it('el 422 `underage` del servidor se pinta traducido', () => {
        const t = (k, v = {}) => `FR:${k.replace(/\{(\w+)\}/g, (_, n) => String(v[n]))}`;
        const body = { detail: { code: 'underage', error_code: 'underage', field: 'age', min_age: 18, message: 'x' } };
        expect(mensajeDeError(body, 'fallback', t)).toBe(`FR:${TITULO_CORTE}`);
    });
});

// ───────────────────────────────────────────── 2. el paso de medidas corta
describe('[P1-PLAN-LOTE-846] el paso de medidas', () => {
    it('una edad de menor no se corrige junto al campo: «Siguiente» corta, borra la edad y no manda nada', async () => {
        const { indice } = pasoDeMedidas();
        const ctx = contexto({ currentStep: indice, maxReachedStep: indice, formData: { ...FORM_COMPLETO, age: '15', height: '', weight: '' } });
        render(<InteractiveAssessmentFlow />, { customContext: ctx });
        expect(screen.queryByText(/Escribe una edad entre/)).toBeNull();   // neutral: no le dice qué número poner
        const siguiente = screen.getByRole('button', { name: /^Siguiente/ });
        expect(siguiente).not.toBeDisabled();                               // aunque falten la altura y el peso
        fireEvent.click(siguiente);
        expect(await screen.findByRole('heading', { name: TITULO_CORTE })).toBeInTheDocument();
        expect(screen.getByText('No guardamos la edad que escribiste.')).toBeInTheDocument();
        expect(ctx.updateData).toHaveBeenCalledWith('age', '');
        expect(ctx.nextStep).not.toHaveBeenCalled();
        expect(screen.queryByText(/PASO\s+\d+\s+DE/i)).toBeNull();          // no es un paso más
        expect(salidas()).toEqual([]);
        expect(navegar).not.toHaveBeenCalled();
    });

    it('también al salir del campo', async () => {
        const { indice } = pasoDeMedidas();
        const ctx = contexto({ currentStep: indice, maxReachedStep: indice, formData: { ...FORM_COMPLETO, age: '13' } });
        render(<InteractiveAssessmentFlow />, { customContext: ctx });
        fireEvent.blur(screen.getByLabelText(/Edad \(años\)/i));
        expect(await screen.findByRole('heading', { name: TITULO_CORTE })).toBeInTheDocument();
    });

    it('un adulto sigue como siempre, y la errata (250) se avisa junto al campo sin decir el rango', () => {
        const { indice } = pasoDeMedidas();
        const ok = contexto({ currentStep: indice, maxReachedStep: indice,
            formData: { ...FORM_COMPLETO, age: '30', height: '170', weight: '150', weightUnit: 'lb' } });
        const r = render(<InteractiveAssessmentFlow />, { customContext: ok });
        fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }));
        expect(ok.nextStep).toHaveBeenCalled();
        expect(screen.queryByRole('heading', { name: TITULO_CORTE })).toBeNull();
        r.unmount();
        const errata = contexto({ currentStep: indice, maxReachedStep: indice, formData: { ...FORM_COMPLETO, age: '250' } });
        render(<InteractiveAssessmentFlow />, { customContext: errata });
        expect(screen.getByText('Revisa la edad.')).toBeInTheDocument();
        expect(screen.getByLabelText(/Edad \(años\)/i).getAttribute('min')).toBe('1');   // tampoco en el `min` del campo
    });

    it('la pantalla del corte: «Me equivoqué…» vuelve al campo y «Entendido, salir» sale del modo invitado', async () => {
        const { indice } = pasoDeMedidas();
        const ctx = contexto({ currentStep: indice, maxReachedStep: indice, formData: { ...FORM_COMPLETO, age: '16' } });
        render(<InteractiveAssessmentFlow />, { customContext: ctx });
        fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Me equivoqué al escribir mi edad' }));
        expect(ctx.setCurrentStep).toHaveBeenCalledWith(indice);
        expect(screen.queryByRole('heading', { name: TITULO_CORTE })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Entendido, salir/ }));
        await waitFor(() => expect(navegar).toHaveBeenCalledWith('/login', { replace: true }));
        expect(ctx.exitGuestSession).toHaveBeenCalled();
        expect(salidas()).toEqual([]);
    });
    it('[ronda 1] tras UNA corrección, un segundo corte ya no ofrece «Me equivoqué…» (solo en memoria)', async () => {
        const { indice } = pasoDeMedidas();
        const ctx = contexto({ currentStep: indice, maxReachedStep: indice, formData: { ...FORM_COMPLETO, age: '16' } });
        render(<InteractiveAssessmentFlow />, { customContext: ctx });
        fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Me equivoqué al escribir mi edad' }));
        fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }));
        expect(await screen.findByRole('heading', { name: TITULO_CORTE })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Me equivoqué al escribir mi edad' })).toBeNull();
        expect(screen.getByRole('button', { name: /Entendido, salir/ })).toBeInTheDocument();
        expect(Object.keys(localStorage).filter((k) => /edad|age|menor/i.test(k))).toEqual([]);
        cleanup();
        // Salir del formulario (desmontar) y volver: la corrección se ofrece otra vez.
        render(<InteractiveAssessmentFlow />, { customContext: ctx });
        fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }));
        expect(await screen.findByRole('button', { name: 'Me equivoqué al escribir mi edad' })).toBeInTheDocument();
    });
});

// ───────────────────────────────────────────── 3. las otras puertas
describe('[P1-PLAN-LOTE-846] salto, envío y cierre del contador', () => {
    it('«Finalizar y Generar» con edad de menor corta ANTES de la hoja del permiso y de /plan', async () => {
        const { total } = pasoDeMedidas();
        const hoja = vi.fn();
        suscribirHojaConsentimientoIA(hoja);
        const ctx = contexto({ currentStep: total - 1, maxReachedStep: total - 1, formData: { ...FORM_COMPLETO, age: '17' } });
        render(<InteractiveAssessmentFlow />, { customContext: ctx });
        fireEvent.click(screen.getByRole('button', { name: /Finalizar y Generar/i }));
        expect(await screen.findByRole('heading', { name: TITULO_CORTE })).toBeInTheDocument();
        expect(hoja.mock.calls.filter(([p]) => p)).toEqual([]);
        expect(navegar).not.toHaveBeenCalledWith('/plan');
        expect(salidas()).toEqual([]);
    });

    it('el salto y el envío miran la edad (fuente)', () => {
        const src = leer('components/assessment/InteractiveAssessmentFlow.jsx');
        for (const desde of ['const submitAndGenerate = async () => {', 'const handleSkipToLastStep = () => {']) {
            const i = src.indexOf(desde);
            const cuerpo = src.slice(i, i + 2500);
            expect(cuerpo, desde).toMatch(/esMenorDeEdad\(formData\.age\)\)\s*\{\s*bloquearPorEdad\(\);\s*return;/);
        }
        const envio = src.slice(src.indexOf('const submitAndGenerate = async () => {'));
        expect(envio.indexOf('bloquearPorEdad()')).toBeLessThan(envio.indexOf('asegurarConsentimientoIA()'));
    });

    it('el cierre del contador corta sin guardar el perfil', async () => {
        const onMenorDeEdad = vi.fn();
        render(<QTrackingFinish onMenorDeEdad={onMenorDeEdad} />, {
            customContext: contexto({ isGuest: false, formData: { ...FORM_COMPLETO, age: '14' } }),
        });
        fireEvent.click(screen.getByRole('button', { name: /Empezar a contar/ }));
        await waitFor(() => expect(onMenorDeEdad).toHaveBeenCalled());
        expect(fetchWithAuth).not.toHaveBeenCalled();
    });

    it('y si el servidor responde 422 `underage` al guardar, pinta el mismo corte', async () => {
        const onMenorDeEdad = vi.fn();
        fetchWithAuth.mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: { code: 'underage' } }) });
        render(<QTrackingFinish onMenorDeEdad={onMenorDeEdad} />, {
            customContext: contexto({ isGuest: false, formData: { ...FORM_COMPLETO, age: '40' } }),
        });
        fireEvent.click(screen.getByRole('button', { name: /Empezar a contar/ }));
        await waitFor(() => expect(onMenorDeEdad).toHaveBeenCalled());
        expect(fetchWithAuth.mock.calls.map(([u]) => u)).toEqual(['/api/profile']);   // ni el interruptor del modo
    });
});
