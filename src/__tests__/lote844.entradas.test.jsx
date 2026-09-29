/**
 * [P1-PLAN-LOTE-844 · 2026-09-29] Cada punto de entrada con IA espera el permiso ANTES de llamar a la IA de terceros.
 *
 * Tres miradas:
 *  1. POSICIÓN: en cada función que llama a un endpoint con 428, la puerta
 *        `faltaPermisoIA() && !(await asegurarConsentimientoIA())`
 *     va ANTES de la llamada (formulario, coach, modo voz, bot de ayuda, escáneres, anotar por texto, cambiar plato,
 *     regenerar día, arreglar sodio, reintentar, regenerar el plan).
 *  2. CERCO: todo fichero cuyo CÓDIGO llama a uno de esos endpoints importa la puerta, o está en una lista corta con
 *     su motivo. Un punto de entrada nuevo sin puerta rompe aquí, no en la revisión de Apple.
 *  3. CONDUCTA: con el permiso sabido en «falta» y la hoja rechazada, el componente NO llama a la IA (y con la hoja
 *     aceptada, sí). Se prueba en dos componentes reales: anotar por texto y el bot de ayuda.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { render, screen, waitFor, fireEvent, cleanup } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import { sinComentarios } from '../../scripts/lib/sin-comentarios.mjs';
import LogMealModal from '../components/dashboard/LogMealModal';
import HelpChatWidget from '../components/dashboard/HelpChatWidget';
import { _resetPantryCacheForTests, setCachedMasterList, setCachedDishes } from '../utils/pantryCache';
import {
    _reiniciarConsentimientoIAParaTests,
    aceptarConsentimientoIA,
    fijarTitularConsentimientoIA,
    rechazarConsentimientoIA,
    sincronizarConsentimientoIADesdePerfil,
    suscribirHojaConsentimientoIA,
} from '../consent/consentimientoIA';
import { AI_CONSENT_VERSION } from '../consent/version';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const SRC = resolve(__dirname, '..');
const leer = (rel) => readFileSync(resolve(SRC, rel), 'utf8').split(String.fromCharCode(13)).join('');
const PUERTA = /faltaPermisoIA\(\)\s*&&\s*!\(await asegurarConsentimientoIA\(\)\)/;

// ───────────────────────────────────────────────────────────── 1. POSICIÓN
const ENTRADAS = [
    ['el envío del formulario', 'components/assessment/InteractiveAssessmentFlow.jsx', 'const submitAndGenerate = async () => {', "navigate('/plan')"],
    ['la generación en /plan (otros caminos)', 'pages/Plan.jsx', 'const processPlan = async () => {', 'generateAIPlanStream(dataToSend'],
    ['regenerar el plan', 'hooks/useRegeneratePlan.js', 'const regeneratePlan = async', "navigate('/plan'"],
    ['reintentar un bloque', 'pages/Plan.jsx', 'const handleRetry = async (chunkId) => {', 'retryPlanChunk(newPlan.id'],
    ['regenerar un bloque simplificado', 'pages/Plan.jsx', 'const handleSimplifyChunk = async (chunkId) => {', 'regenerateChunkSimplified(newPlan.id'],
    ['enviar al coach', 'pages/AgentPage.jsx', 'const handleSend = async', "fetchWithAuth('/api/chat/stream'"],
    ['la foto en el chat', 'pages/AgentPage.jsx', 'const handleSend = async', "fetchWithAuth('/api/diary/upload'"],
    ['el bot de ayuda', 'components/dashboard/HelpChatWidget.jsx', 'const sendMessage = useCallback(async', "fetchWithAuth('/api/help/chat'"],
    ['escanear comida', 'components/dashboard/ScanMealModal.jsx', 'const analizar = useCallback(async', "fetchWithAuth('/api/diary/upload'"],
    ['aclarar una duda de la foto', 'components/dashboard/ScanMealModal.jsx', 'const responderOtra = async', "'/api/diary/scan/ajuste-duda'"],
    ['corregir un ingrediente de la foto', 'components/dashboard/ScanMealModal.jsx', 'const cambiarIngrediente = async', "'/api/diary/scan/ingrediente'"],
    ['describir el plato de la foto', 'components/dashboard/ScanMealModal.jsx', 'const describirPlato = async', "'/api/diary/consumed/estimate-plate'"],
    ['anotar por texto (macros)', 'components/dashboard/LogMealModal.jsx', 'const estimarMacros = async', "'/api/diary/consumed/estimate-macros'"],
    ['anotar por texto (plato)', 'components/dashboard/LogMealModal.jsx', 'const calcularPlato = async', "'/api/diary/consumed/estimate-plate'"],
    ['escanear la nevera', 'components/pantry/PantryScanButton.jsx', 'const handlePhotoSelected = async', "'/api/inventory/photo-scan'"],
    ['arreglar el sodio del día', 'pages/Dashboard.jsx', 'const handleFixSodiumDay = async', '/fix-sodium-day`'],
    ['cambiar un plato', 'pages/Dashboard.jsx', 'const runSwapWithConsentFlow = async', 'await regenerateSingleMeal('],
];

describe('[P1-PLAN-LOTE-844] 1 · la puerta va ANTES de la llamada a la IA', () => {
    it.each(ENTRADAS)('%s', (_nombre, fichero, desde, llamada) => {
        const src = leer(fichero);
        const i = src.indexOf(desde);
        expect(i, `no encontré «${desde}» en ${fichero}`).toBeGreaterThan(-1);
        const j = src.indexOf(llamada, i);
        expect(j, `no encontré «${llamada}» tras «${desde}»`).toBeGreaterThan(i);
        expect(PUERTA.test(src.slice(i, j)), `${fichero}: falta la puerta del permiso antes de ${llamada}`).toBe(true);
    });

    it('regenerar el día: las TRES llamadas del Dashboard pasan por la puerta', () => {
        const src = leer('pages/Dashboard.jsx');
        const sitios = [...src.matchAll(/await regenerateDay\(writableIdx/g)].map((m) => m.index);
        expect(sitios.length).toBe(3);
        for (const k of sitios) expect(PUERTA.test(src.slice(k - 200, k)), `regenerateDay en ${k} sin puerta`).toBe(true);
    });

    it('el modo voz pide el permiso antes de abrir el micrófono (y no se abre solo al aceptar: necesita el toque)', () => {
        const src = leer('pages/AgentPage.jsx');
        const i = src.indexOf('const abrirModoVoz = () => {');
        const tramo = src.slice(i, src.indexOf('vozCoach.abrir();', i));
        expect(tramo).toMatch(/if \(faltaPermisoIA\(\)\) \{\s*asegurarConsentimientoIA\(\)/);
        expect(tramo).toMatch(/return;\s*\}/);
    });

    it('la puerta del chat va tras el guard de entrada (test_p1_chat_stop_power: primeros 1.800 caracteres) y antes de abrir el turno', () => {
        const src = leer('pages/AgentPage.jsx');
        const i = src.indexOf('const handleSend = async');
        const guard = src.indexOf('isTurnActiveRef.current) return;', i);
        const puerta = src.slice(i).search(PUERTA) + i;
        const turno = src.indexOf('_setTurnActive(true)', i);
        expect(guard - i).toBeLessThan(1800);
        expect(puerta).toBeGreaterThan(guard);
        expect(puerta).toBeLessThan(turno);
    });

    it('/plan: un 428 que llega hasta fetchWithRetry es terminal y su rama va antes de «Revisa tus datos»', () => {
        const src = leer('pages/Plan.jsx');
        const reintento = src.slice(src.indexOf('async function fetchWithRetry'), src.indexOf('const PIPELINE_TIMEOUT_MS'));
        expect(reintento).toMatch(/response\.status === 428\) \{\s*const err = new Error\(t\('Activa la IA para usar esto'\)\);\s*err\.code = 'ai_consent_required';\s*err\.terminal = true;/);
        const rama = src.indexOf("if (error.code === 'ai_consent_required') {");
        expect(rama).toBeGreaterThan(-1);
        expect(rama).toBeLessThan(src.indexOf('if (error.terminal) {', rama));
    });
});

// ───────────────────────────────────────────────────────────── 2. CERCO
const ENDPOINTS_IA = [
    /\/api\/plans\/analyze/, /\/generation-runs['"`]/, /\/swap-meal(?!\/persist)/, /\/regenerate-day/, /\/fix-sodium-day/,
    /\/recipe\/expand/, /\/retry-chunk/, /\/regenerate-simplified/, /\/regen-degraded/, /\/api\/chat\/stream/,
    /['"`]\/api\/chat['"`]/, /\/api\/chat\/message/, /\/api\/chat\/voz/, /\/api\/diary\/upload/, /\/estimate-macros/,
    /\/estimate-plate/, /\/scan\/ajuste-duda/, /\/scan\/ingrediente/, /\/api\/inventory\/photo-scan/, /\/api\/help\/chat/,
];
// Ficheros que nombran un endpoint con IA sin llevar la puerta, y por qué es correcto.
const SIN_PUERTA_PROPIA = {
    'config/api.ts': 'los ayudantes `retryPlanChunk`/`regenerateChunkSimplified` (la puerta va en su llamador, Plan.jsx) y la lista de exentos del timeout; aquí vive el interceptor del 428',
    'context/AssessmentContext.jsx': '`/swap-meal` y `/regenerate-day`: la puerta va en sus llamadores del Dashboard (el contexto tiene tope de líneas)',
    'utils/vozEnLaNube.js': '`/api/chat/voz` solo corre dentro del modo voz, que pide el permiso al abrirse',
};

function* ficheros(dir) {
    for (const nombre of readdirSync(dir)) {
        const p = join(dir, nombre);
        if (statSync(p).isDirectory()) {
            if (nombre !== '__tests__') yield* ficheros(p);
        } else if (/\.(jsx?|tsx?)$/.test(nombre) && !nombre.includes('.test.')) {
            yield relative(SRC, p).split(sep).join('/');
        }
    }
}

describe('[P1-PLAN-LOTE-844] 2 · el cerco', () => {
    const conLlamada = [...ficheros(SRC)].filter((rel) => {
        if (rel.startsWith('consent/')) return false;
        const codigo = sinComentarios(leer(rel));
        return ENDPOINTS_IA.some((re) => re.test(codigo));
    });

    it('encuentra los ficheros que llaman a la IA (un cerco vacío pasaría en vacío)', () => {
        expect(conLlamada.length).toBeGreaterThanOrEqual(10);
        expect(conLlamada).toEqual(expect.arrayContaining(['pages/AgentPage.jsx', 'components/dashboard/ScanMealModal.jsx', 'pages/Plan.jsx']));
    });

    it('cada fichero que llama a un endpoint con IA importa la puerta, o está en la lista con su motivo', () => {
        const sueltos = conLlamada.filter((rel) => !SIN_PUERTA_PROPIA[rel] && !/from '[./]+consent\/consentimientoIA'/.test(leer(rel)));
        expect(sueltos, `sin la puerta del permiso: ${sueltos.join(', ')}`).toEqual([]);
    });

    it('la lista no guarda muertos: cada excepción sigue llamando a un endpoint con IA', () => {
        for (const rel of Object.keys(SIN_PUERTA_PROPIA)) expect(conLlamada, rel).toContain(rel);
    });
});

// ───────────────────────────────────────────────────────────── 3. CONDUCTA
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const SIN_PERMISO = { version: AI_CONSENT_VERSION, vigente: false, ai_consent_version: null, ai_consent_at: null, ai_cn_transfer_at: null, ai_consent_revoked_at: null, analytics: null };
const UID = '11111111-2222-3333-4444-555555555555';

const cuentaSinPermiso = () => {
    localStorage.setItem('mealfit_user_id', UID);
    fijarTitularConsentimientoIA({ uid: UID });
    sincronizarConsentimientoIADesdePerfil(UID, SIN_PERMISO);
};
const hojaQueDiceNo = () => suscribirHojaConsentimientoIA((p) => { if (p) queueMicrotask(() => rechazarConsentimientoIA()); });
const hojaQueAcepta = () => suscribirHojaConsentimientoIA((p) => { if (p) queueMicrotask(() => { void aceptarConsentimientoIA({ analytics: false }); }); });
const llamadasA = (trozo) => fetchWithAuth.mock.calls.filter(([u]) => String(u).includes(trozo));

describe('[P1-PLAN-LOTE-844] 3 · con el permiso en «falta», nada sale hacia la IA sin decir que sí', () => {
    beforeEach(() => {
        _reiniciarConsentimientoIAParaTests();
        localStorage.clear();
        _resetPantryCacheForTests();
        setCachedMasterList([]);
        setCachedDishes([]);
        fetchWithAuth.mockReset();
        toast.info.mockReset();
        toast.error.mockReset();
    });
    afterEach(() => cleanup());

    const abrirEstimar = async (user) => {
        render(<LogMealModal onClose={() => {}} />);
        await user.type(screen.getByLabelText('Buscar alimento'), 'mangú con huevo');
        await user.click(screen.getByText('Añadir «mangú con huevo» con macros propias'));
        return screen.getByText('Estimar macros por mí');
    };

    it('anotar por texto + «Ahora no»: no se llama a estimate-macros y se avisa «Activa la IA para usar esto»', async () => {
        cuentaSinPermiso();
        hojaQueDiceNo();
        fetchWithAuth.mockImplementation(async () => respuesta([]));
        const user = userEvent.setup();
        const boton = await abrirEstimar(user);
        await user.click(boton);
        await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Activa la IA para usar esto', expect.any(Object)));
        expect(llamadasA('estimate-macros')).toEqual([]);
    });

    it('anotar por texto + «Aceptar»: se anota el permiso y DESPUÉS sale la estimación', async () => {
        cuentaSinPermiso();
        hojaQueAcepta();
        fetchWithAuth.mockImplementation(async (url) => {
            if (String(url) === '/api/consents') return respuesta({ ...SIN_PERMISO, vigente: true, ai_consent_version: AI_CONSENT_VERSION, ai_consent_at: '2026-09-29T15:00:00+00:00', plan_reanudado: false });
            if (String(url).includes('estimate-macros')) return respuesta({ name: 'Mangú con huevo', macros: { kcal: 500, protein: 20, carbs: 60, fats: 18 }, estimated: true });
            return respuesta([]);
        });
        const user = userEvent.setup();
        const boton = await abrirEstimar(user);
        await user.click(boton);
        await waitFor(() => expect(llamadasA('estimate-macros').length).toBe(1));
        const orden = fetchWithAuth.mock.calls.map(([u]) => String(u));
        expect(orden.indexOf('/api/consents')).toBeLessThan(orden.findIndex((u) => u.includes('estimate-macros')));
    });

    it('el bot de ayuda + «Ahora no»: la pregunta no sale y se queda escrita', async () => {
        cuentaSinPermiso();
        hojaQueDiceNo();
        render(<HelpChatWidget onClose={() => {}} />);
        const caja = screen.getByPlaceholderText('Escribe tu duda…');
        fireEvent.change(caja, { target: { value: '¿Cómo cambio un plato?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));
        await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Activa la IA para usar esto', expect.any(Object)));
        expect(llamadasA('/api/help/chat')).toEqual([]);
        expect(caja).toHaveValue('¿Cómo cambio un plato?');
    });

    it('sin saber aún el permiso (perfil en camino), la acción sigue de inmediato: decide el servidor', async () => {
        fetchWithAuth.mockImplementation(async () => respuesta({ reply: 'Hola' }));
        render(<HelpChatWidget onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText('Escribe tu duda…'), { target: { value: 'hola' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));
        await waitFor(() => expect(llamadasA('/api/help/chat').length).toBe(1));
        expect(toast.info).not.toHaveBeenCalled();
    });
});
