// frontend/src/__tests__/lote834.test.jsx
// [P1-PLAN-LOTE-834 · 2026-09-29] /admin · el detalle de una cuenta de prueba (spec
// docs/superpowers/specs/2026-09-29-admin-cuentas-actividad-pruebas-design.md §4.4, §4.5, §13.4; contrato 9) y, en
// Métricas, «Ajustes de la gente» (§13.7; contrato 8).
//   · Detalle: pestañas Formulario · Comidas · Planes · Conversaciones · Actividad, cada una pedida AL ABRIRLA y otra
//     vez cada vez que se abre (cada vista queda anotada y una marca quitada corta la siguiente: sin caché). 409
//     `aviso_pendiente` ⇒ «Esperando a que vea el aviso en la app»; 403 ⇒ «Esta cuenta ya no es de prueba». Lo del
//     servidor se pinta como TEXTO. Las fotos del chat llegan como blob desde el endpoint de adjuntos y se liberan al
//     cerrar el hilo o el detalle. La petición de la pestaña o del rango que se deja atrás se aborta.
//   · Resumen: 404 ⇒ nada; 200 ⇒ una fila por ajuste con su barra apilada y sus números EN TEXTO, los cambios del
//     periodo por origen y los ajustes del dispositivo, con el periodo que ya está elegido en Métricas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';
import AdminPruebaDetalle from '../pages/AdminPruebaDetalle';

const A = '11111111-1111-4111-8111-111111111111';
const BASE = `/api/admin/cuentas/${A}/prueba`;
const RESUMEN_URL = '/api/admin/ajustes/resumen';
const RUTA_LISTA = '/api/admin/cuentas?';

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const imagen = (tipo = 'image/jpeg') => ({
    ok: true, status: 200, headers: { get: () => tipo },
    blob: async () => new Blob(['foto'], { type: tipo }),
    json: async () => { throw new Error('no es JSON'); },
});

let peticiones;
/** `rutas`: [prefijo | RegExp, manejador]; la primera que casa responde. Lo demás, 404 (como el servidor sin knob). */
function servidor(rutas) {
    peticiones = [];
    fetchWithAuth.mockImplementation(async (url, opciones = {}) => {
        peticiones.push({ url, opciones });
        if (url.startsWith('/api/admin/yo')) return respuesta({ ok: true });
        if (url.startsWith('/api/admin/metricas')) return respuesta({ dias: 7, generado: '2026-09-29T04:00:00+00:00', bloques: [] });
        for (const [prueba, fn] of rutas) {
            if (typeof prueba === 'string' ? url.startsWith(prueba) : prueba.test(url)) return fn(url, opciones);
        }
        return respuesta({ detail: 'Not Found' }, 404);
    });
}
const pedidas = (prefijo) => peticiones.filter((p) => p.url.startsWith(prefijo));
const exactas = (url) => peticiones.filter((p) => p.url === url);
const delDetalle = () => pedidas(BASE);
const consulta = (url) => new URL(url, 'http://panel').searchParams;
const montarDetalle = () => render(<AdminPruebaDetalle userId={A} email="ana@correo.com" />);
const montarPanel = () => render(
    <MemoryRouter initialEntries={['/admin']}><Routes><Route path="/admin" element={<AdminPage />} /></Routes></MemoryRouter>,
);
const pestana = (nombre) => screen.getByRole('tab', { name: nombre });
/** El panel a la vista: los demás llevan `hidden` y `getByRole` no los ve. */
const panel = () => screen.getByRole('tabpanel');
const hoyLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const diasEntre = (desde, hasta) => (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000;

// ─── Datos con la forma del contrato 9 ──────────────────────────────────────────────────────────────────────────────
const FORMULARIO = {
    campos: [
        { grupo: 'Objetivo', etiqueta: 'Objetivo', valor: 'Perder grasa' },
        { grupo: 'Salud', etiqueta: 'Alergias', valor: ['Maní', 'Mariscos'] },
        { grupo: 'Salud', etiqueta: 'Condiciones', valor: '<img src=x onerror="alert(1)">' },
        { grupo: 'Salud', etiqueta: 'Medicamentos', valor: null },
        { grupo: 'Horarios', etiqueta: 'Come fuera de casa', valor: false },
    ],
    crudo: { goal: 'lose_fat', allergies: ['Maní', 'Mariscos'], country: 'DO' },
    memoria: [{ id: 'f1', dato: 'Prefiere desayunos salados', creado: '2026-09-20T10:00:00+00:00', relevancia: 0.8 }],
};
const comidasDe = (url, plato = 'Moro de guandules con pollo') => {
    const q = consulta(url);
    return {
        desde: q.get('desde'), hasta: q.get('hasta'), comidas: [
            { id: 'm1', at: '2026-09-29T16:30:00+00:00', tipo: 'almuerzo', plato,
              ingredientes: ['150 g de arroz', '100 g de pollo'], kcal: 640, proteina: 38, carbohidratos: 72, grasas: 18,
              origen: 'plan_meal', plan_ref: { plan_id: 'p1', day_index: 1, meal_index: 2 } },
            { id: 'm2', at: '2026-09-28T12:00:00+00:00', tipo: 'desayuno', plato: 'Mangú con huevo', ingredientes: [],
              kcal: 420, proteina: 18, carbohidratos: 50, grasas: 14, origen: 'photo', plan_ref: null },
        ],
    };
};
const PLANES = {
    planes: [
        { id: 'p1', creado: '2026-09-02T09:00:00+00:00', nombre: 'Plan de septiembre', kcal: 850, estado_generacion: 'partial',
          dias: 14, revision: 2, bloques: { completed: 2, failed: 1 },
          bloques_detalle: [
              { id: 'c1', estado: 'completed', intentos: 1, semana: 1, dias_offset: 0, motivo_fallo: null },
              { id: 'c2', estado: 'completed', intentos: 2, semana: 1, dias_offset: 3, motivo_fallo: null },
              { id: 'c3', estado: 'failed', intentos: 3, semana: 2, dias_offset: 7, motivo_fallo: 'timeout del modelo' },
          ] },
        { id: 'p2', creado: '2026-08-20T09:00:00+00:00', nombre: 'Plan viejo', kcal: 900, estado_generacion: 'complete',
          dias: 7, revision: 1, bloques: {}, bloques_detalle: [] },
    ],
};
const PLAN_P1 = {
    id: 'p1', nombre: 'Plan de septiembre', creado: '2026-09-02T09:00:00+00:00', bloques: [],
    dias: [
        { dia: 1, comidas: [{ tipo: 'desayuno', plato: 'Avena con guineo', ingredientes: ['40 g de avena', '1 guineo'],
                              kcal: 350, macros: { proteina: 12, carbohidratos: 60, grasas: 6 },
                              pasos: ['Cocina la avena', 'Añade el guineo'] }] },
        { dia: 2, comidas: [] },
    ],
};
const SESIONES = {
    sesiones: [
        { id: 's1', inicio: '2026-09-28T20:00:00+00:00', ultimo: '2026-09-28T20:10:00+00:00', mensajes: 4,
          pulgares_abajo: 1, fotos: 1, primer_mensaje: 'Hola, ¿qué ceno hoy?' },
        { id: 's2', inicio: '2026-09-27T09:00:00+00:00', ultimo: '2026-09-27T09:05:00+00:00', mensajes: 2,
          pulgares_abajo: 0, fotos: 0, primer_mensaje: 'Buenos días' },
    ],
};
const HILO = {
    id: 's1',
    mensajes: [
        { id: 'x1', rol: 'persona', texto: 'Hola, ¿qué ceno hoy?\nTengo pollo', at: '2026-09-28T20:00:00+00:00',
          feedback: null, fotos: [{ id: 'a1', tipo: 'image/jpeg' }] },
        { id: 'x2', rol: 'coach', texto: '**Pollo al horno** <b>con</b> ensalada', at: '2026-09-28T20:01:00+00:00',
          feedback: 'down', fotos: [] },
        { id: 'x3', rol: 'coach', texto: 'Otra idea: pescado', at: '2026-09-28T20:02:00+00:00', feedback: 'up', fotos: [] },
    ],
};
const actividadDe = (url) => ({
    dias: Number(consulta(url).get('dias')), gasto_ia_usd: 0.2849,
    eventos: [
        { at: '2026-09-29T16:30:00+00:00', tipo: 'comida', titulo: 'Registró «Moro de guandules con pollo»', detalle: '640 kcal · del plan' },
        { at: '2026-09-29T13:00:00+00:00', tipo: 'ia', titulo: 'Escaneo de comida', detalle: 'vision_scan · gemini · US$0.0031' },
    ],
});
// ─── Contrato 8 ──────────────────────────────────────────────────────────────────────────────────────────────────────
const RESUMEN = {
    cuentas: 12,
    ajustes: [
        { clave: 'water_tracker_enabled', etiqueta: 'Hidratación', grupo: 'Capacidades',
          conteo: { encendido: 5, apagado: 2, automatico: 0, sin_elegir: 5, valores: {} } },
        { clave: 'nevera_enabled', etiqueta: 'Nevera', grupo: 'Capacidades',
          conteo: { encendido: 3, apagado: 1, automatico: 8, sin_elegir: 0, valores: {} } },
        { clave: 'plan_mode', etiqueta: 'Modo de uso', grupo: 'Uso',
          conteo: { encendido: 0, apagado: 0, automatico: 0, sin_elegir: 0, valores: { plan: 9, tracking: 3 } } },
    ],
    cambios: [{ clave: 'water_tracker_enabled', etiqueta: 'Hidratación', por_origen: { app: 4, coach: 2, sistema: 1 } }],
    dispositivo: {
        tema: { dark: 3, light: 2, system: 1 },
        notificaciones_permiso: { granted: 4, denied: 1 },
        plataformas: { web: 5, android: 2, ios: 1, pwa: 1 },
    },
};

let crear;
let revocar;
let originales;
beforeEach(() => {
    vi.clearAllMocks();
    let n = 0;
    originales = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };
    crear = vi.fn(() => `blob:foto-${++n}`);
    revocar = vi.fn();
    URL.createObjectURL = crear;
    URL.revokeObjectURL = revocar;
});
afterEach(() => {
    URL.createObjectURL = originales.crear;
    URL.revokeObjectURL = originales.revocar;
});

describe('[834] el detalle de prueba: pestañas', () => {
    it('cada pestaña pide su ruta SOLO al abrirla (Formulario, la primera, al montarse)', async () => {
        servidor([[BASE, async () => respuesta({})]]);
        montarDetalle();
        const lista = screen.getByRole('tablist', { name: 'Secciones del detalle' });
        expect(within(lista).getAllByRole('tab').map((t) => t.textContent))
            .toEqual(['Formulario', 'Comidas', 'Planes', 'Conversaciones', 'Actividad']);
        expect(pestana('Formulario')).toHaveAttribute('aria-selected', 'true');
        await waitFor(() => expect(delDetalle().map((p) => p.url)).toEqual([`${BASE}/formulario`]));
        fireEvent.click(pestana('Comidas'));
        expect(pestana('Comidas')).toHaveAttribute('aria-selected', 'true');
        await waitFor(() => expect(delDetalle()).toHaveLength(2));
        const comidas = new URL(delDetalle()[1].url, 'http://panel');
        expect(comidas.pathname).toBe(`${BASE}/comidas`);
        // 30 días por defecto, contados con hoy (la fecha del dispositivo): desde = hoy − 29, hasta = hoy.
        expect(comidas.searchParams.get('hasta')).toBe(hoyLocal());
        expect(diasEntre(comidas.searchParams.get('desde'), comidas.searchParams.get('hasta'))).toBe(29);
        fireEvent.click(pestana('Planes'));
        await waitFor(() => expect(delDetalle().at(-1).url).toBe(`${BASE}/planes`));
        fireEvent.click(pestana('Conversaciones'));
        await waitFor(() => expect(delDetalle().at(-1).url).toBe(`${BASE}/conversaciones`));
        fireEvent.click(pestana('Actividad'));
        await waitFor(() => expect(delDetalle().at(-1).url).toBe(`${BASE}/actividad?dias=7&tipos=`));
        expect(delDetalle()).toHaveLength(5);                                      // una por pestaña abierta
        expect(fetchWithAuth.mock.calls.every(([u]) => !u.includes('/prueba/') || u.startsWith(BASE))).toBe(true);
    });

    it('sin caché: volver a una pestaña la pide otra vez; si la marca se quitó entre medias, «Esta cuenta ya no es de prueba» y nada del contenido de antes', async () => {
        let marcada = true;
        servidor([[BASE, async () => (marcada ? respuesta(FORMULARIO) : respuesta({ detail: 'no_es_prueba' }, 403))]]);
        montarDetalle();
        expect(await within(panel()).findByText('Perder grasa')).toBeInTheDocument();
        marcada = false;                                                          // la persona sale (o el equipo quita la marca)
        fireEvent.click(pestana('Comidas'));
        expect(await within(panel()).findByText('Esta cuenta ya no es de prueba.')).toBeInTheDocument();
        fireEvent.click(pestana('Formulario'));
        expect(await within(panel()).findByText('Esta cuenta ya no es de prueba.')).toBeInTheDocument();
        expect(screen.queryByText('Perder grasa')).toBeNull();
        expect(exactas(`${BASE}/formulario`)).toHaveLength(2);
    });

    it('409 «aviso_pendiente»: «Esperando a que vea el aviso en la app» en cada pestaña, sin datos; «Comprobar otra vez» vuelve a pedir', async () => {
        servidor([[BASE, async () => respuesta({ detail: 'aviso_pendiente' }, 409)]]);
        montarDetalle();
        expect(await within(panel()).findByText('Esperando a que vea el aviso en la app.')).toBeInTheDocument();
        expect(within(panel()).queryByRole('button', { name: 'Reintentar' })).toBeNull();   // esperar no es un fallo
        fireEvent.click(within(panel()).getByRole('button', { name: 'Comprobar otra vez' }));
        await waitFor(() => expect(exactas(`${BASE}/formulario`)).toHaveLength(2));
        fireEvent.click(pestana('Conversaciones'));
        expect(await within(panel()).findByText('Esperando a que vea el aviso en la app.')).toBeInTheDocument();
        expect(within(panel()).queryByRole('list')).toBeNull();
    });

    it('un fallo del registro de accesos (503) no enseña nada y se puede reintentar', async () => {
        let veces = 0;
        servidor([[BASE, async () => { veces += 1; return veces === 1 ? respuesta({ detail: 'x' }, 503) : respuesta(FORMULARIO); }]]);
        montarDetalle();
        expect(await within(panel()).findByRole('alert')).toHaveTextContent('no se enseña nada');
        fireEvent.click(within(panel()).getByRole('button', { name: 'Reintentar' }));
        expect(await within(panel()).findByText('Perder grasa')).toBeInTheDocument();
    });

    it('patrón ARIA: tablist/tab/tabpanel enlazados y foco itinerante con las flechas, sin abrir ni pedir nada', async () => {
        servidor([[BASE, async () => respuesta({})]]);
        montarDetalle();
        await waitFor(() => expect(delDetalle()).toHaveLength(1));
        const tabs = screen.getAllByRole('tab');
        expect(tabs[0]).toHaveAttribute('tabindex', '0');
        tabs.slice(1).forEach((t) => expect(t).toHaveAttribute('tabindex', '-1'));
        const visible = panel();
        expect(visible).toHaveAttribute('aria-labelledby', tabs[0].id);
        expect(tabs[0]).toHaveAttribute('aria-controls', visible.id);
        for (const t of tabs) expect(document.getElementById(t.getAttribute('aria-controls'))).not.toBeNull();
        tabs[0].focus();
        fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
        expect(document.activeElement).toBe(tabs[1]);
        fireEvent.keyDown(tabs[1], { key: 'End' });
        expect(document.activeElement).toBe(tabs[4]);
        fireEvent.keyDown(tabs[4], { key: 'ArrowRight' });
        expect(document.activeElement).toBe(tabs[0]);
        fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(tabs[4]);
        fireEvent.keyDown(tabs[4], { key: 'Home' });
        expect(document.activeElement).toBe(tabs[0]);
        // Activación MANUAL: mover el foco no abre ni pide (cada vista deja su fila en el registro de accesos).
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
        expect(delDetalle()).toHaveLength(1);
    });

    it('cambiar de pestaña aborta la petición en vuelo de la anterior', async () => {
        servidor([[`${BASE}/formulario`, () => new Promise(() => {})], [BASE, async () => respuesta({})]]);
        montarDetalle();
        await waitFor(() => expect(delDetalle()).toHaveLength(1));
        const { signal } = delDetalle()[0].opciones;
        expect(signal).toBeTruthy();
        expect(signal.aborted).toBe(false);
        fireEvent.click(pestana('Planes'));
        expect(signal.aborted).toBe(true);
    });

    // [ronda 1] Alt+← es «Atrás» del navegador, Ctrl+Inicio/Fin desplazan la página, Mayús+flecha selecciona: no son de las
    // pestañas y el manejador no debe tragárselas con `preventDefault` (ni mover el foco).
    it('las teclas con Alt, Ctrl, Cmd o Mayús no se tragan: son del navegador y no mueven el foco', async () => {
        servidor([[BASE, async () => respuesta({})]]);
        montarDetalle();
        await waitFor(() => expect(delDetalle()).toHaveLength(1));
        const tabs = screen.getAllByRole('tab');
        tabs[0].focus();
        for (const modificador of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
            for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
                // `fireEvent` devuelve false si algún manejador llamó a preventDefault.
                expect(fireEvent.keyDown(tabs[0], { key, [modificador]: true })).toBe(true);
                expect(document.activeElement).toBe(tabs[0]);
            }
        }
        // Sin modificador, la misma tecla sí es de las pestañas.
        expect(fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })).toBe(false);
        expect(document.activeElement).toBe(tabs[1]);
    });
});

// [ronda 1] Lo que un HIJO de la pestaña (el hilo de una conversación, los días de un plan) oye del servidor sobre la
// CUENTA vale para el detalle entero: si ya no es de prueba (403) o la persona aún no vio el aviso (409), el detalle deja de
// enseñar lo que había —la lista con sus vistas previas, los planes— y pinta el aviso en su lugar.
describe('[834] el detalle de prueba: un 403/409 de un hijo invalida el detalle entero', () => {
    const abrirHilo = async () => {
        fireEvent.click(pestana('Conversaciones'));
        fireEvent.click(await within(panel()).findByRole('button', { name: /Hola, ¿qué ceno hoy\?/ }));
    };
    const abrirDiasDelPlan = async () => {
        fireEvent.click(pestana('Planes'));
        const plan = (await within(panel()).findByRole('heading', { name: 'Plan de septiembre' })).closest('[data-plan]');
        fireEvent.click(within(plan).getByRole('button', { name: 'Ver los días' }));
    };
    const sinContenido = () => {
        // Ni la lista de conversaciones con sus vistas previas, ni el hilo, ni los planes.
        expect(screen.queryByText('Hola, ¿qué ceno hoy?')).toBeNull();
        expect(screen.queryByText('Buenos días')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Volver a las conversaciones' })).toBeNull();
        expect(screen.queryByRole('heading', { name: /^Conversación del / })).toBeNull();
        expect(screen.queryByRole('heading', { name: 'Plan de septiembre' })).toBeNull();
        expect(screen.queryByRole('heading', { name: 'Plan viejo' })).toBeNull();
        expect(screen.queryByRole('list')).toBeNull();
    };

    it('403 al abrir una conversación: la lista y sus vistas previas desaparecen y sale «Esta cuenta ya no es de prueba»', async () => {
        servidor([
            [`${BASE}/conversaciones/s1`, async () => respuesta({ detail: 'no_es_prueba' }, 403)],
            [`${BASE}/conversaciones`, async () => respuesta(SESIONES)],
            [BASE, async () => respuesta({})],
        ]);
        montarDetalle();
        await abrirHilo();
        expect(await within(panel()).findByText('Esta cuenta ya no es de prueba.')).toBeInTheDocument();
        expect(within(panel()).getByText(/Quitaron la marca/)).toBeInTheDocument();
        sinContenido();
        // Es el detalle entero: en otra pestaña, el mismo aviso (sin pedir nada nuevo), y ninguna pestaña deja contenido.
        const antes = delDetalle().length;
        fireEvent.click(pestana('Planes'));
        expect(within(panel()).getByText('Esta cuenta ya no es de prueba.')).toBeInTheDocument();
        fireEvent.click(pestana('Conversaciones'));
        expect(within(panel()).getByText('Esta cuenta ya no es de prueba.')).toBeInTheDocument();
        expect(delDetalle()).toHaveLength(antes);
        sinContenido();
        // Un 403 no ofrece «Comprobar otra vez»: para volver a mirar se reabre el detalle desde la ficha.
        expect(within(panel()).queryByRole('button')).toBeNull();
    });

    it('403 al pedir los días de un plan: la lista de planes se va y sale el mismo aviso', async () => {
        servidor([
            [`${BASE}/planes/p1`, async () => respuesta({ detail: 'no_es_prueba' }, 403)],
            [`${BASE}/planes`, async () => respuesta(PLANES)],
            [BASE, async () => respuesta({})],
        ]);
        montarDetalle();
        await abrirDiasDelPlan();
        expect(await within(panel()).findByText('Esta cuenta ya no es de prueba.')).toBeInTheDocument();
        sinContenido();
        expect(screen.queryByRole('button', { name: 'Ver los días' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Ocultar los días' })).toBeNull();
    });

    it('409 «aviso_pendiente» en un hilo: «Esperando a que vea el aviso en la app» en lugar de todo; «Comprobar otra vez» vuelve a pedir la pestaña', async () => {
        servidor([
            [`${BASE}/conversaciones/s1`, async () => respuesta({ detail: 'aviso_pendiente' }, 409)],
            [`${BASE}/conversaciones`, async () => respuesta(SESIONES)],
            [BASE, async () => respuesta({})],
        ]);
        montarDetalle();
        await abrirHilo();
        expect(await within(panel()).findByText('Esperando a que vea el aviso en la app.')).toBeInTheDocument();
        sinContenido();
        expect(within(panel()).queryByRole('button', { name: 'Reintentar' })).toBeNull();   // esperar no es un fallo
        expect(exactas(`${BASE}/conversaciones`)).toHaveLength(1);
        fireEvent.click(within(panel()).getByRole('button', { name: 'Comprobar otra vez' }));
        // El aviso se suelta y la pestaña se pide otra vez desde cero: vuelve la lista de conversaciones.
        expect(await within(panel()).findByRole('button', { name: /Hola, ¿qué ceno hoy\?/ })).toBeInTheDocument();
        expect(exactas(`${BASE}/conversaciones`)).toHaveLength(2);
        expect(screen.queryByText('Esperando a que vea el aviso en la app.')).toBeNull();
    });

    it('un 404 del hilo NO invalida nada: sigue diciendo que esa conversación no existe y se puede volver a la lista', async () => {
        servidor([
            [`${BASE}/conversaciones/s1`, async () => respuesta({ detail: 'Not Found' }, 404)],
            [`${BASE}/conversaciones`, async () => respuesta(SESIONES)],
            [BASE, async () => respuesta({})],
        ]);
        montarDetalle();
        await abrirHilo();
        expect(await within(panel()).findByText('Esta conversación no es de esta cuenta o ya no existe.')).toBeInTheDocument();
        expect(screen.queryByText('Esta cuenta ya no es de prueba.')).toBeNull();
        fireEvent.click(within(panel()).getByRole('button', { name: 'Volver a las conversaciones' }));
        expect(within(panel()).getByRole('button', { name: /Hola, ¿qué ceno hoy\?/ })).toBeInTheDocument();
    });

    // [ronda 1] El aviso se decide por el CÓDIGO del servidor; el estado HTTP es el respaldo si el código falta.
    it('el aviso se decide por el código del servidor antes que por el estado HTTP (y por el estado si el código falta)', async () => {
        let respuestaDe = () => respuesta({ detail: 'aviso_pendiente' }, 423);
        servidor([[BASE, async () => respuestaDe()]]);
        montarDetalle();
        expect(await within(panel()).findByText('Esperando a que vea el aviso en la app.')).toBeInTheDocument();
        respuestaDe = () => respuesta({ detail: 'no_es_prueba' }, 410);
        fireEvent.click(pestana('Comidas'));
        expect(await within(panel()).findByText('Esta cuenta ya no es de prueba.')).toBeInTheDocument();
        respuestaDe = () => respuesta({}, 403);                                   // sin código: manda el estado
        fireEvent.click(pestana('Planes'));
        expect(await within(panel()).findByText('Esta cuenta ya no es de prueba.')).toBeInTheDocument();
        respuestaDe = () => respuesta({}, 409);
        fireEvent.click(pestana('Actividad'));
        expect(await within(panel()).findByText('Esperando a que vea el aviso en la app.')).toBeInTheDocument();
        respuestaDe = () => respuesta({ detail: 'otra_cosa' }, 500);              // un fallo cualquiera sigue siendo un fallo
        fireEvent.click(pestana('Formulario'));
        expect(await within(panel()).findByRole('alert')).toHaveTextContent('No se pudo cargar esta sección.');
    });
});

describe('[834] el detalle de prueba: contenido de cada pestaña', () => {
    it('Formulario: campos por grupo, el JSON crudo PLEGADO y lo que el coach recuerda; lo del servidor, como texto', async () => {
        servidor([[`${BASE}/formulario`, async () => respuesta(FORMULARIO)]]);
        montarDetalle();
        const p = panel();
        const salud = await within(p).findByRole('region', { name: 'Salud' });
        expect(within(salud).getByText('Alergias').closest('[data-campo]')).toHaveTextContent('Maní, Mariscos');
        expect(within(salud).getByText('Medicamentos').closest('[data-campo]')).toHaveTextContent('—');
        expect(within(salud).getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
        expect(p.querySelector('img')).toBeNull();                               // nunca se interpreta como HTML
        expect(within(within(p).getByRole('region', { name: 'Horarios' })).getByText('No')).toBeInTheDocument();
        const crudo = within(p).getByText('Ver el formulario en crudo (JSON)').closest('details');
        expect(crudo.open).toBe(false);
        expect(crudo.querySelector('pre').textContent).toBe(JSON.stringify(FORMULARIO.crudo, null, 2));
        const memoria = within(p).getByRole('region', { name: 'Lo que el coach recuerda' });
        expect(within(memoria).getByText('Prefiere desayunos salados')).toBeInTheDocument();
    });

    it('Formulario con una respuesta sin campos (o rara) no revienta', async () => {
        servidor([[BASE, async () => respuesta({ campos: 'x', crudo: null, memoria: [null, 3] })]]);
        montarDetalle();
        expect(await within(panel()).findByText('El formulario está vacío.')).toBeInTheDocument();
        expect(within(panel()).getByText('El coach no recuerda nada de esta cuenta todavía.')).toBeInTheDocument();
    });

    it('Comidas: hora, tipo, plato, ingredientes, macros, origen y la comida del plan a la que corresponde', async () => {
        servidor([[`${BASE}/comidas`, async (url) => respuesta(comidasDe(url))], [BASE, async () => respuesta({})]]);
        montarDetalle();
        fireEvent.click(pestana('Comidas'));
        const moro = (await within(panel()).findByText('Moro de guandules con pollo')).closest('[data-comida]');
        expect(moro).toHaveTextContent('Almuerzo');
        expect(moro).toHaveTextContent('640 kcal');
        expect(moro).toHaveTextContent('Proteína 38 g · Carbohidratos 72 g · Grasas 18 g');
        expect(moro).toHaveTextContent('150 g de arroz, 100 g de pollo');
        expect(moro).toHaveTextContent('Del plan («Me lo comí»)');
        expect(moro).toHaveTextContent('Plan: día 2, comida 3');                // índices del plan, contados desde 1
        expect(moro.querySelector('time')).toHaveAttribute('dateTime', '2026-09-29T16:30:00+00:00');
        const mangu = within(panel()).getByText('Mangú con huevo').closest('[data-comida]');
        expect(mangu).toHaveTextContent('Desayuno');
        expect(mangu).toHaveTextContent('Foto (escáner)');
        expect(mangu).not.toHaveTextContent('Plan: día');
        expect(within(panel()).getByText(/2 comidas$/)).toBeInTheDocument();
    });

    it('Comidas: el rango (7/30/90 días) cambia desde/hasta; la petición vieja se aborta y su respuesta no pisa la nueva', async () => {
        const soltar = {};
        servidor([
            [`${BASE}/comidas`, (url) => new Promise((ok) => {
                const n = diasEntre(consulta(url).get('desde'), consulta(url).get('hasta')) + 1;
                soltar[n] = () => ok(respuesta(comidasDe(url, `Plato del rango de ${n} días`)));
            })],
            [BASE, async () => respuesta({})],
        ]);
        montarDetalle();
        fireEvent.click(pestana('Comidas'));
        await waitFor(() => expect(pedidas(`${BASE}/comidas`)).toHaveLength(1));
        const primera = pedidas(`${BASE}/comidas`)[0];
        const selector = within(panel()).getByLabelText('Periodo de las comidas');
        expect(selector).toHaveValue('30');
        fireEvent.change(selector, { target: { value: '7' } });
        await waitFor(() => expect(pedidas(`${BASE}/comidas`)).toHaveLength(2));
        expect(primera.opciones.signal.aborted).toBe(true);
        const q7 = consulta(pedidas(`${BASE}/comidas`)[1].url);
        expect(q7.get('hasta')).toBe(hoyLocal());
        expect(diasEntre(q7.get('desde'), q7.get('hasta'))).toBe(6);
        await act(async () => { soltar[7](); });
        expect(await within(panel()).findByText('Plato del rango de 7 días')).toBeInTheDocument();
        await act(async () => { soltar[30](); });                                // la vieja llega tarde: se ignora
        expect(within(panel()).queryByText('Plato del rango de 30 días')).toBeNull();
        expect(within(panel()).getByText('Plato del rango de 7 días')).toBeInTheDocument();
        fireEvent.change(selector, { target: { value: '90' } });
        await waitFor(() => expect(pedidas(`${BASE}/comidas`)).toHaveLength(3));
        const q90 = consulta(pedidas(`${BASE}/comidas`)[2].url);
        expect(diasEntre(q90.get('desde'), q90.get('hasta'))).toBe(89);         // 90 días contando hoy: el tope
    });

    it('Planes: estado en palabra, bloques por estado y su detalle plegado; «Ver los días» pide el plan y lo pinta plegado por día', async () => {
        servidor([
            [`${BASE}/planes/p1`, async () => respuesta(PLAN_P1)],
            [`${BASE}/planes/p2`, async () => respuesta({ detail: 'Not Found' }, 404)],
            [`${BASE}/planes`, async () => respuesta(PLANES)],
            [BASE, async () => respuesta({})],
        ]);
        montarDetalle();
        fireEvent.click(pestana('Planes'));
        const plan = (await within(panel()).findByRole('heading', { name: 'Plan de septiembre' })).closest('[data-plan]');
        expect(within(plan).getByText('Parcial')).toBeInTheDocument();
        expect(plan).toHaveTextContent('2 completados');
        expect(plan).toHaveTextContent('1 fallido');
        expect(plan).toHaveTextContent('850 kcal al día');
        expect(plan).toHaveTextContent('revisión 2');
        const bloques = within(plan).getByText('Ver los bloques (3)').closest('details');
        expect(bloques.open).toBe(false);
        expect(bloques).toHaveTextContent('timeout del modelo');
        expect(pedidas(`${BASE}/planes/`)).toHaveLength(0);                      // los días no se piden hasta abrirlos
        const ver = within(plan).getByRole('button', { name: 'Ver los días' });
        expect(ver).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(ver);
        expect(within(plan).getByRole('button', { name: 'Ocultar los días' })).toHaveAttribute('aria-expanded', 'true');
        const dia1 = (await within(plan).findByText(/^Día 1/)).closest('details');
        expect(dia1.open).toBe(false);
        expect(dia1).toHaveTextContent('Avena con guineo');
        expect(dia1).toHaveTextContent('40 g de avena');
        expect(dia1).toHaveTextContent('Cocina la avena');
        expect(exactas(`${BASE}/planes/p1`)).toHaveLength(1);
        // Un plan de otra cuenta responde 404 (aunque exista): se dice, sin datos.
        const otro = within(panel()).getByRole('heading', { name: 'Plan viejo' }).closest('[data-plan]');
        expect(within(otro).getByText('Completo')).toBeInTheDocument();
        fireEvent.click(within(otro).getByRole('button', { name: 'Ver los días' }));
        expect(await within(otro).findByText('Este plan no es de esta cuenta o ya no existe.')).toBeInTheDocument();
    });

    it('Conversaciones: lista → hilo con «La persona» / «El coach», texto tal cual, 👍/👎 con palabras y la foto como blob que se libera al cerrar', async () => {
        servidor([
            [`${BASE}/adjuntos/a1`, async () => imagen()],
            [`${BASE}/conversaciones/s1`, async () => respuesta(HILO)],
            [`${BASE}/conversaciones`, async () => respuesta(SESIONES)],
            [BASE, async () => respuesta({})],
        ]);
        montarDetalle();
        fireEvent.click(pestana('Conversaciones'));
        const abrir = await within(panel()).findByRole('button', { name: /Hola, ¿qué ceno hoy\?/ });
        const fila = abrir.closest('li');
        expect(fila).toHaveTextContent('4 mensajes');
        expect(fila).toHaveTextContent('1 foto');
        expect(fila).toHaveTextContent('1 respuesta marcada como no útil');
        expect(pedidas(`${BASE}/conversaciones/`)).toHaveLength(0);
        fireEvent.click(abrir);
        const hilo = await within(panel()).findByRole('list', { name: 'Mensajes' });
        expect(exactas(`${BASE}/conversaciones/s1`)).toHaveLength(1);
        expect(document.activeElement).toBe(within(panel()).getByRole('heading', { name: /^Conversación del / }));
        const [m1, m2, m3] = within(hilo).getAllByRole('listitem');
        expect(m1).toHaveAttribute('data-rol', 'persona');
        expect(within(m1).getByText('La persona')).toBeInTheDocument();
        expect(m1.querySelector('[data-texto]').textContent).toBe('Hola, ¿qué ceno hoy?\nTengo pollo');
        expect(m2).toHaveAttribute('data-rol', 'coach');
        expect(within(m2).getByText('El coach')).toBeInTheDocument();
        expect(m2.querySelector('[data-texto]').textContent).toBe('**Pollo al horno** <b>con</b> ensalada');
        expect(m2.querySelector('b')).toBeNull();
        expect(m2).toHaveTextContent('Marcada como no útil');
        expect(m3).toHaveTextContent('Marcada como útil');
        // La foto se pide al endpoint de adjuntos (con la sesión, por fetchWithAuth) y se pinta desde un blob: el token
        // nunca va en el `src` de la imagen.
        const foto = await within(m1).findByRole('img', { name: 'Foto adjunta por la persona' });
        expect(foto.getAttribute('src')).toBe('blob:foto-1');
        expect(exactas(`${BASE}/adjuntos/a1`)).toHaveLength(1);
        expect(revocar).not.toHaveBeenCalled();
        fireEvent.click(within(panel()).getByRole('button', { name: 'Volver a las conversaciones' }));
        expect(revocar).toHaveBeenCalledWith('blob:foto-1');
        // De vuelta en la lista: el foco en la conversación que se abrió, y la lista no se vuelve a pedir.
        expect(document.activeElement).toBe(within(panel()).getByRole('button', { name: /Hola, ¿qué ceno hoy\?/ }));
        expect(exactas(`${BASE}/conversaciones`)).toHaveLength(1);
    });

    it('una foto que no llega lo dice en su sitio (sin romper el hilo)', async () => {
        servidor([
            [`${BASE}/adjuntos/a1`, async () => respuesta({ detail: 'Not Found' }, 404)],
            [`${BASE}/conversaciones/s1`, async () => respuesta(HILO)],
            [`${BASE}/conversaciones`, async () => respuesta(SESIONES)],
        ]);
        montarDetalle();
        fireEvent.click(pestana('Conversaciones'));
        fireEvent.click(await within(panel()).findByRole('button', { name: /Hola, ¿qué ceno hoy\?/ }));
        expect(await within(panel()).findByText('No se pudo cargar la foto.')).toBeInTheDocument();
        expect(crear).not.toHaveBeenCalled();
        expect(within(panel()).getByText('Otra idea: pescado')).toBeInTheDocument();
    });

    it('Actividad: el periodo (7/14/30) y los tipos cambian la petición; el gasto de IA y cada evento con su tipo en palabra', async () => {
        servidor([[`${BASE}/actividad`, async (url) => respuesta(actividadDe(url))], [BASE, async () => respuesta({})]]);
        const ultimaQ = () => consulta(pedidas(`${BASE}/actividad`).at(-1).url);
        montarDetalle();
        fireEvent.click(pestana('Actividad'));
        expect(await within(panel()).findByText('Gasto de IA en estos 7 días: US$0.28')).toBeInTheDocument();
        expect(pedidas(`${BASE}/actividad`)[0].url).toBe(`${BASE}/actividad?dias=7&tipos=`);
        const evento = within(panel()).getByText('Escaneo de comida').closest('[data-evento]');
        expect(evento).toHaveAttribute('data-evento', 'ia');
        expect(evento).toHaveTextContent('Uso de IA');
        expect(evento).toHaveTextContent('vision_scan · gemini · US$0.0031');
        fireEvent.change(within(panel()).getByLabelText('Periodo de la actividad'), { target: { value: '14' } });
        await waitFor(() => expect(ultimaQ().get('dias')).toBe('14'));
        const tipos = within(panel()).getByRole('group', { name: 'Tipos de evento' });
        fireEvent.click(within(tipos).getByRole('checkbox', { name: 'Uso de IA' }));
        await waitFor(() => expect(ultimaQ().get('tipos')).toBe('ia'));
        fireEvent.click(within(tipos).getByRole('checkbox', { name: 'Comidas' }));
        await waitFor(() => expect(ultimaQ().get('tipos')).toBe('comida,ia'));  // orden fijo, no el de los clics
        expect(ultimaQ().get('dias')).toBe('14');
        fireEvent.click(within(panel()).getByRole('button', { name: 'Quitar el filtro' }));
        await waitFor(() => expect(ultimaQ().get('tipos')).toBe(''));
        expect(within(tipos).getByRole('checkbox', { name: 'Comidas' })).not.toBeChecked();
    });
});

describe('[834] el detalle montado en la ficha (hueco del lote 833)', () => {
    const fila = {
        user_id: A, email: 'ana@correo.com', nombre: 'Ana', alta: '2026-09-01T12:00:00+00:00', plan_pagado: 'gratis',
        plan_efectivo: 'gratis', es_admin: false, prueba: { estado: 'activa', desde: '2026-09-29T10:00:00+00:00' },
        actividad: { ultima: null, comidas_total: 0, comidas_30d: 0, planes: 0, mensajes_coach: 0, escaneos: 0,
                     gasto_ia_30d_usd: 0, dias_activos_30d: 0 },
        modo: 'tracking', idioma: 'es-DO', pais: 'DO',
    };
    const ficha = {
        user_id: A, email: 'ana@correo.com', nombre: 'Ana', alta: '2026-09-01T12:00:00+00:00', plan_pagado: 'gratis',
        plan_efectivo: 'gratis', es_admin: false, suscripcion: { estado: null, fin: null, paypal: false }, cortesia: null,
        creditos: { usados: 0, plan: 10, regalo: 0, tope: 10 }, coach: { usados: 0, plan: 40, regalo: 0, tope: 40 },
        regalos: [], validez_creditos: { mes: '2026-10-01T00:00:00+00:00', mes_siguiente: '2026-11-01T00:00:00+00:00' },
        prueba: { estado: 'activa', desde: '2026-09-29T10:00:00+00:00', motivo: 'tester del beta',
                  marcada_por: 'dueno@bioboros.com', aviso_visto_at: '2026-09-29T12:00:00+00:00', historial: [] },
    };

    it('«Ver detalle» monta las pestañas dentro de la región del detalle; «Volver a la ficha» lo cierra y libera las fotos', async () => {
        servidor([
            [`${BASE}/adjuntos/a1`, async () => imagen()],
            [`${BASE}/conversaciones/s1`, async () => respuesta(HILO)],
            [`${BASE}/conversaciones`, async () => respuesta(SESIONES)],
            [`${BASE}/formulario`, async () => respuesta(FORMULARIO)],
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: ficha })],
            [RUTA_LISTA, async () => respuesta({ cuentas: [fila], total: 1, pagina: 1, por_pagina: 50 })],
        ]);
        montarPanel();
        fireEvent.click(await screen.findByRole('tab', { name: 'Cuentas' }));
        const t = await screen.findByRole('table', { name: 'Todas las cuentas' });
        fireEvent.click(within(t).getByRole('button', { name: 'ana@correo.com' }));
        const art = await screen.findByRole('article', { name: 'Cuenta ana@correo.com' });
        fireEvent.click(within(art).getByRole('button', { name: 'Ver detalle' }));
        const detalle = screen.getByRole('region', { name: 'Detalle de ana@correo.com' });
        expect(document.activeElement).toBe(detalle);                            // el detalle no le roba el foco a la región
        expect(within(detalle).getByRole('tablist', { name: 'Secciones del detalle' })).toBeInTheDocument();
        expect(await within(detalle).findByText('Perder grasa')).toBeInTheDocument();
        fireEvent.click(within(detalle).getByRole('tab', { name: 'Conversaciones' }));
        fireEvent.click(await within(detalle).findByRole('button', { name: /Hola, ¿qué ceno hoy\?/ }));
        await within(detalle).findByRole('img', { name: 'Foto adjunta por la persona' });
        fireEvent.click(within(detalle).getByRole('button', { name: 'Volver a la ficha' }));
        expect(revocar).toHaveBeenCalledWith('blob:foto-1');
        expect(screen.queryByRole('tablist', { name: 'Secciones del detalle' })).toBeNull();
        expect(screen.getByRole('article', { name: 'Cuenta ana@correo.com' })).toBeInTheDocument();
    });
});

describe('[834] Métricas → «Ajustes de la gente»', () => {
    it('404 (interruptor apagado) o una respuesta sin la forma del contrato: no se pinta nada', async () => {
        servidor([]);
        const { unmount } = montarPanel();
        await waitFor(() => expect(pedidas(RESUMEN_URL)).toHaveLength(1));
        await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
        expect(screen.queryByRole('heading', { name: 'Ajustes de la gente' })).toBeNull();
        expect(screen.queryByText(/ajustes de la gente/i)).toBeNull();
        expect(document.querySelector('[data-ajustes-gente]')).toBeNull();
        unmount();
        servidor([[RESUMEN_URL, async () => respuesta({ dias: 7, bloques: [] })]]);
        montarPanel();
        await waitFor(() => expect(pedidas(RESUMEN_URL)).toHaveLength(1));
        await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
        expect(document.querySelector('[data-ajustes-gente]')).toBeNull();
    });

    it('200: una fila por ajuste con su barra apilada y sus números EN TEXTO; los cambios por origen y el dispositivo', async () => {
        servidor([[RESUMEN_URL, async () => respuesta(RESUMEN)]]);
        montarPanel();
        const bloque = await screen.findByRole('region', { name: 'Ajustes de la gente' });
        expect(pedidas(RESUMEN_URL)[0].url).toBe(`${RESUMEN_URL}?dias=7`);
        expect(bloque).toHaveTextContent('12 cuentas');
        const filas = [...bloque.querySelectorAll('[data-ajuste]')];
        expect(filas.map((f) => f.getAttribute('data-ajuste'))).toEqual(['water_tracker_enabled', 'nevera_enabled', 'plan_mode']);
        const agua = bloque.querySelector('[data-ajuste="water_tracker_enabled"]');
        expect(within(agua).getByText('Hidratación')).toBeInTheDocument();
        expect(within(agua).getByText('Encendido: 5')).toBeInTheDocument();
        expect(within(agua).getByText('Apagado: 2')).toBeInTheDocument();
        expect(within(agua).getByText('Sin elegir: 5')).toBeInTheDocument();
        expect(within(agua).queryByText(/Automático/)).toBeNull();               // un cero no se pinta
        const barra = agua.querySelector('[data-barra]');
        expect(barra).toHaveAttribute('aria-hidden', 'true');                    // la barra acompaña; el dato va en el texto
        expect([...barra.querySelectorAll('[data-segmento]')].map((s) => [s.getAttribute('data-segmento'), s.style.flexGrow]))
            .toEqual([['encendido', '5'], ['apagado', '2'], ['sin_elegir', '5']]);
        const nevera = bloque.querySelector('[data-ajuste="nevera_enabled"]');
        expect(within(nevera).getByText('Automático: 8')).toBeInTheDocument();
        const modo = bloque.querySelector('[data-ajuste="plan_mode"]');
        expect(within(modo).getByText('Plan: 9')).toBeInTheDocument();
        expect(within(modo).getByText('Seguimiento: 3')).toBeInTheDocument();
        expect(within(bloque).getByRole('region', { name: 'Capacidades' })).toContainElement(nevera);
        // La leyenda nombra cada estado con su palabra.
        const leyenda = within(bloque).getByRole('list', { name: 'Leyenda' });
        expect(within(leyenda).getAllByRole('listitem').map((li) => li.textContent))
            .toEqual(['Con un valor elegido', 'Encendido', 'Automático', 'Apagado', 'Sin elegir']);
        // Cambios del periodo, por origen.
        const tabla = within(bloque).getByRole('table', { name: 'Cambios de los últimos 7 días' });
        const fila = within(tabla).getByText('Hidratación').closest('tr');
        expect([...fila.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['Hidratación', '4', '2', '1', '7']);
        // Ajustes del dispositivo.
        const disp = within(bloque).getByRole('region', { name: 'En el dispositivo' });
        expect(within(disp).getByText('Oscuro: 3')).toBeInTheDocument();
        expect(within(disp).getByText('Automático (sistema): 1')).toBeInTheDocument();
        expect(within(disp).getByText('Concedido: 4')).toBeInTheDocument();
        expect(within(disp).getByText('Denegado: 1')).toBeInTheDocument();
        expect(within(disp).getByText('Web: 5')).toBeInTheDocument();
        expect(within(disp).getByText('App instalada (PWA): 1')).toBeInTheDocument();
    });

    it('pide con el periodo ya elegido en Métricas (7 → 30 → 90) y «Actualizar» también lo refresca', async () => {
        servidor([[RESUMEN_URL, async () => respuesta(RESUMEN)]]);
        montarPanel();
        await screen.findByRole('region', { name: 'Ajustes de la gente' });
        fireEvent.click(screen.getByRole('button', { name: '30 días' }));
        await waitFor(() => expect(pedidas(RESUMEN_URL).at(-1).url).toBe(`${RESUMEN_URL}?dias=30`));
        expect(await screen.findByRole('table', { name: 'Cambios de los últimos 30 días' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '90 días' }));
        await waitFor(() => expect(pedidas(RESUMEN_URL).at(-1).url).toBe(`${RESUMEN_URL}?dias=90`));
        await screen.findByRole('table', { name: 'Cambios de los últimos 90 días' });
        const antes = pedidas(RESUMEN_URL).length;
        fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
        await waitFor(() => expect(pedidas(RESUMEN_URL).length).toBe(antes + 1));
        expect(pedidas(RESUMEN_URL).at(-1).url).toBe(`${RESUMEN_URL}?dias=90`);
    });

    it('un fallo lo dice en su bloque, sin tocar el «Reintentar» de las métricas, y se puede reintentar', async () => {
        let veces = 0;
        servidor([[RESUMEN_URL, async () => { veces += 1; return veces === 1 ? respuesta({ detail: 'x' }, 503) : respuesta(RESUMEN); }]]);
        montarPanel();
        const bloque = await screen.findByRole('region', { name: 'Ajustes de la gente' });
        expect(within(bloque).getByText('No se pudieron cargar los ajustes de la gente.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
        expect(screen.queryByRole('status', { name: /ajustes/i })).toBeNull();
        fireEvent.click(within(bloque).getByRole('button', { name: 'Reintentar los ajustes' }));
        expect(await within(bloque).findByText('Encendido: 5')).toBeInTheDocument();
        expect(within(bloque).queryByText('No se pudieron cargar los ajustes de la gente.')).toBeNull();
    });
});

describe('[834] reglas de la hoja y del fuente', () => {
    it('el chat conserva sus saltos de línea, el JSON y las tablas se desplazan en su caja y hay reglas para el teléfono', () => {
        const detalle = readFileSync(resolve(process.cwd(), 'src/pages/AdminPruebaDetalle.module.css'), 'utf8');
        expect(detalle).toMatch(/\.texto\s*\{[^}]*white-space:\s*pre-wrap/);
        expect(detalle).toMatch(/\.json\s*\{[^}]*overflow-x:\s*auto/);
        expect(detalle).toMatch(/@media \(max-width: 640px\)/);
        const resumen = readFileSync(resolve(process.cwd(), 'src/pages/AdminAjustesResumen.module.css'), 'utf8');
        expect(resumen).toMatch(/@media \(max-width: 640px\)/);
        // Sin/elegir no se distingue solo por color: lleva trama.
        expect(resumen).toMatch(/\[data-segmento="sin_elegir"\][^{]*\{[^}]*repeating-linear-gradient/);
    });

    it('lo del servidor nunca entra como HTML', () => {
        for (const f of ['src/pages/AdminPruebaDetalle.jsx', 'src/pages/AdminAjustesResumen.jsx']) {
            expect(readFileSync(resolve(process.cwd(), f), 'utf8')).not.toMatch(/dangerouslySetInnerHTML/);
        }
    });
});
