// [P1-PLAN-LOTE-166 · 2026-09-22] Lo que falta del formulario y de la app nativa para la beta.
//
// 1. Una cuenta nueva a mitad del formulario no podía llegar a Configuración (ni a «Eliminar cuenta», que la App Store
//    exige alcanzable dentro de la app): en el teléfono no hay barra de direcciones. Ahora hay un botón.
// 2. «Cerrar sesión» prometía «tu plan, tu Nevera y tu historial quedan guardados» a quien aún no tenía nada guardado:
//    lo contestado del formulario se borra del teléfono. Ahora lo dice.
// 3. El campo enfocado no puede quedar debajo del teclado (red de seguridad del formulario y de Configuración).
// 4. El OTA se confirma en cuanto la app pinta: en un teléfono lento, esperar 6 s podía pasarse de los 10 s del plugin,
//    que entonces volvía al paquete del APK y bloqueaba ESE paquete para siempre.
// 5. Cada tester dice qué paquete corre: el menú muestra el id del OTA.
// 6. «Exportar datos» en la app nativa ya no dice «revisa tu carpeta de descargas» (no hay descarga): comparte o copia.
// 7. Configuración usa los MISMOS rangos que el formulario (aceptaba 25 kg y el servidor rechaza por debajo de 30).
// 8. Los avisos de Android van por un canal propio con nombre traducido y aviso emergente (era «Default», normal).
// 9. La cantidad del componedor acepta coma decimal (teclados en español, francés, italiano, portugués).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent } from './utils/test-utils';
import InteractiveAssessmentFlow from '../components/assessment/InteractiveAssessmentFlow';
import LogoutConfirmModal from '../components/dashboard/LogoutConfirmModal';
import { campoTapadoPorTeclado, useCampoVisibleConTeclado } from '../hooks/useCampoVisibleConTeclado';
import { cantidadEscrita } from '../components/dashboard/LogMealModal';

const _nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', async () => {
    const real = await vi.importActual('react-router-dom');
    return { ...real, useNavigate: () => _nav.navigate };
});

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

const FORM = { appMode: 'plan', gender: 'male', age: '30' };
const montar = (ctx = {}) => render(<InteractiveAssessmentFlow />, {
    customContext: {
        currentStep: 0, maxReachedStep: 0, planData: null, formData: FORM,
        setCurrentStep: vi.fn(), setMaxReachedStep: vi.fn(), nextStep: vi.fn(), prevStep: vi.fn(),
        updateData: vi.fn(), resetApp: vi.fn(), exitGuestSession: vi.fn(),
        loadingSensitive: false, isGuest: false, session: { user: { id: 'u1' } },
        userProfile: { plan_mode: 'plan', health_profile: {} },
        ...ctx,
    },
});

beforeEach(() => { _nav.navigate.mockReset(); });

describe('lote 166 · Configuración alcanzable desde el formulario', () => {
    it('una cuenta sin panel ve el botón y la lleva a Configuración', () => {
        montar();
        // dos sitios (teléfono a la izquierda, escritorio a la derecha) y el CSS deja ver uno; jsdom no carga CSS
        const botones = screen.getAllByRole('button', { name: 'Configuración' });
        expect(botones).toHaveLength(2);
        fireEvent.click(botones[0]);
        expect(_nav.navigate).toHaveBeenCalledWith('/dashboard/settings');
    });

    it('el invitado no lo ve (su ruta de Configuración no existe), ni quien tiene panel', () => {
        montar({ isGuest: true, session: null });
        expect(screen.queryAllByRole('button', { name: 'Configuración' })).toHaveLength(0);
    });

    it('en el teléfono va junto a la salida (no pisa el logo); en escritorio, junto al idioma (no pisa la píldora)', () => {
        const l = leer('src/components/assessment/InteractiveAssessmentLayout.jsx');
        expect(l.match(/\{botonAjustes\(styles\.ajustesMovil\)\}/g)).toHaveLength(2);
        expect(l).toContain('{botonAjustes(styles.ajustesEscritorio)}');
        const css = leer('src/components/assessment/InteractiveAssessmentLayout.module.css');
        expect(css).toMatch(/@media \(min-width: 769px\) \{\s*\.ajustesMovil \{\s*display: none;/);
        expect(css).toMatch(/@media \(max-width: 768px\) \{\s*\.ajustesEscritorio \{\s*display: none;/);
    });
});

describe('lote 166 · cerrar sesión dice la verdad a mitad del alta', () => {
    const abrir = (props) => render(
        <LogoutConfirmModal isOpen onConfirm={vi.fn()} onCancel={vi.fn()} userEmail="a@b.c" {...props} />,
    );
    it('sin nada guardado aún, avisa de que lo contestado se borra', () => {
        abrir({ sinTerminar: true });
        expect(screen.getByText(/Aún no terminaste el formulario/)).toBeTruthy();
        expect(screen.queryByText('Tu plan, tu Nevera y tu historial quedan guardados en tu cuenta.')).toBeNull();
    });
    it('con plan o contador, la promesa de siempre', () => {
        abrir({});
        expect(screen.getByText('Tu plan, tu Nevera y tu historial quedan guardados en tu cuenta.')).toBeTruthy();
    });
    it('el formulario se lo pide cuando no hay panel al que volver', () => {
        const l = leer('src/components/assessment/InteractiveAssessmentLayout.jsx');
        expect(l).toContain('sinTerminar={!_puedeVolverAlPanel}');
    });
});

describe('lote 166 · el campo enfocado no queda bajo el teclado', () => {
    const rect = (top, bottom) => ({ getBoundingClientRect: () => ({ top, bottom }) });
    it('tapado si su borde inferior cae por debajo de lo visible', () => {
        const vv = { height: 400, offsetTop: 0 };
        expect(campoTapadoPorTeclado(rect(380, 430), vv)).toBe(true);
        expect(campoTapadoPorTeclado(rect(100, 140), vv)).toBe(false);
        expect(campoTapadoPorTeclado(rect(-60, -20), vv)).toBe(true);   // por encima, fuera de vista
        expect(campoTapadoPorTeclado(rect(100, 140), null)).toBe(false); // sin visualViewport no se toca nada
    });
    it('con pantalla táctil y el campo tapado, lo sube UNA vez; si se ve, no lo toca', async () => {
        vi.useFakeTimers();
        const mm = window.matchMedia;
        window.matchMedia = (q) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} });
        const vvReal = Object.getOwnPropertyDescriptor(window, 'visualViewport');
        let alto = 300;
        Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => ({ height: alto, offsetTop: 0 }) });
        const Prueba = () => { useCampoVisibleConTeclado(); return <input aria-label="campo" />; };
        try {
            render(<Prueba />);
            const campo = screen.getByLabelText('campo');
            campo.getBoundingClientRect = () => ({ top: 311, bottom: 357 });
            campo.scrollIntoView = vi.fn();
            campo.focus();
            fireEvent.focusIn(campo);
            vi.advanceTimersByTime(400);
            expect(campo.scrollIntoView).toHaveBeenCalledTimes(1);
            expect(campo.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
            alto = 700;
            fireEvent.focusIn(campo);
            vi.advanceTimersByTime(400);
            expect(campo.scrollIntoView).toHaveBeenCalledTimes(1);
        } finally {
            window.matchMedia = mm;
            if (vvReal) Object.defineProperty(window, 'visualViewport', vvReal);
            else delete window.visualViewport;
            vi.useRealTimers();
        }
    });

    it('el formulario y Configuración lo usan; el chat no (su foco no se mueve)', () => {
        expect(leer('src/components/assessment/InteractiveAssessmentLayout.jsx')).toContain('useCampoVisibleConTeclado();');
        expect(leer('src/pages/Settings.jsx')).toContain('useCampoVisibleConTeclado();');
        expect(leer('src/pages/AgentPage.jsx')).not.toContain('useCampoVisibleConTeclado');
    });
});

describe('lote 166 · el OTA se confirma al pintar', () => {
    it('sondea #root desde el arranque y precarga el plugin', () => {
        const s = leer('src/native/liveUpdate.js');
        expect(s).toContain("const plugin = import('@capawesome/capacitor-live-update')");
        expect(s).toContain("if (document.getElementById('root')?.childElementCount) { confirmar(); return; }");
        expect(s).not.toMatch(/\}, 6000\);/);
    });
    it('el binario siguiente da más margen (15 s)', () => {
        const c = leer('capacitor.config.ts');
        expect(c).toMatch(/LiveUpdate: \{ readyTimeout: 15000,/);
    });
});

describe('lote 166 · beta nativa', () => {
    it('el menú muestra el paquete OTA que corre', () => {
        const d = leer('src/components/dashboard/DashboardLayout.jsx');
        expect(d).toContain('v{APP_VERSION}{_otaId ? ` · ${_otaId}` : \'\'}');
    });
    it('exportar en la app nativa no promete una descarga', () => {
        const s = leer('src/pages/Settings.jsx');
        const i = s.indexOf('const handleExportData = async () => {');
        const f = s.slice(i, i + 3200);
        expect(f).toContain('if (isNativeApp()) {');
        expect(f).toContain('navigator.share');
        expect(f).toContain('navigator.clipboard');
    });
    it('Configuración valida con los rangos del formulario', () => {
        const s = leer('src/pages/Settings.jsx');
        expect(s).not.toContain("weightUnit === 'lb' ? 55 : 25");
        expect(s).toContain('BIO_RANGES');
    });
    it('los avisos de Android van por su canal, con nombre traducido', () => {
        const a = leer('src/utils/avisosDeComida.js');
        expect(a).toContain("export const CANAL_ANDROID = 'bioboros-avisos';");
        expect(a).toContain('importance: 4');
        expect(a).toContain('channelId: CANAL_ANDROID');
    });
});

describe('lote 166 · textos del formulario que prometían otra cosa', () => {
    it('el cierre del contador ya no dice «dashboard» ni que se pregunta todo otra vez', () => {
        const s = leer('src/components/assessment/questions/QTrackingFinish.jsx');
        expect(s).not.toContain('lo enciendes desde el mismo dashboard');
        expect(s).toContain('lo enciendes desde tu panel o desde Configuración, y solo te preguntamos lo que falte.');
    });
    it('«Tres respuestas rápidas» solo cuando son tres', () => {
        const s = leer('src/components/assessment/questions/QShoppingHabits.jsx');
        expect(s).toContain("askTopup ? t('Tres respuestas rápidas. Puedes dejarlo para después.') : t('Dos respuestas rápidas. Puedes dejarlo para después.')");
    });
    it('en el contador, las tarjetas de país hablan del catálogo del diario, no del plan', () => {
        const s = leer('src/components/assessment/questions/QCountry.jsx');
        expect(s).toContain("t('El catálogo de alimentos de tu diario se adapta a tu país.')");
        expect(s).toContain("t('Catálogo nativo de alimentos para tu diario, con medidas locales.')");
    });
    it('«Editar» del panel de política abre la pregunta concreta', () => {
        const d = leer('src/pages/Dashboard.jsx');
        expect(d).toContain("onEdit={(campo) => navigate('/assessment', campo ? { state: { irACampo: campo } } : undefined)}");
    });
});

describe('lote 166 · la cantidad acepta coma decimal', () => {
    it('«1,5» es 1.5; lo que no es número no entra', () => {
        expect(cantidadEscrita('1,5')).toBe('1.5');
        expect(cantidadEscrita('2')).toBe('2');
        expect(cantidadEscrita('')).toBe('');
        expect(cantidadEscrita('.5')).toBe('.5');
        expect(cantidadEscrita('1,5,')).toBeNull();
        expect(cantidadEscrita('abc')).toBeNull();
    });
});
