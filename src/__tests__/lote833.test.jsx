// frontend/src/__tests__/lote833.test.jsx
// [P1-PLAN-LOTE-833 · 2026-09-29] /admin · Cuentas con el interruptor de cuentas de prueba encendido (spec
// docs/superpowers/specs/2026-09-29-admin-cuentas-actividad-pruebas-design.md §4.5, §13.1, §13.4-§13.6): la lista de
// todas las cuentas (búsqueda, filtro, orden, páginas, casillas, marcar varias, CSV), la ficha ampliada (Actividad,
// Ajustes con su historial, Cuenta de prueba con marcar/quitar) y el paso al detalle como estado de la página. Con el
// interruptor apagado el servidor responde 404 a la lista y el panel se queda como el del lote 775.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const actividad = (extra = {}) => ({
    ultima: '2026-09-28T15:30:00+00:00', comidas_total: 57, comidas_30d: 41, planes: 3, mensajes_coach: 12,
    escaneos: 9, gasto_ia_30d_usd: 0.2849, dias_activos_30d: 14, ...extra,
});
const fila = (extra = {}) => ({
    user_id: A, email: 'ana@correo.com', nombre: 'Ana', alta: '2026-09-01T12:00:00+00:00',
    plan_pagado: 'gratis', plan_efectivo: 'gratis', es_admin: false, prueba: null,
    actividad: actividad(), modo: 'tracking', idioma: 'es-DO', pais: 'DO', ...extra,
});
const lista = (extra = {}) => ({
    cuentas: [
        fila(),
        fila({
            user_id: B, email: 'beto@correo.com', nombre: 'Beto',
            prueba: { estado: 'activa', desde: '2026-09-29T10:00:00+00:00' },
            actividad: actividad({ comidas_total: 5, comidas_30d: 4, planes: 1, mensajes_coach: 0, escaneos: 2,
                gasto_ia_30d_usd: 1.5, dias_activos_30d: 3 }),
        }),
        fila({
            user_id: C, email: 'duena@bioboros.com', nombre: 'Dueña', es_admin: true, plan_pagado: 'admin',
            plan_efectivo: 'admin', prueba: { estado: 'aviso_pendiente', desde: '2026-09-29T11:00:00+00:00' },
            actividad: actividad({ ultima: null, comidas_total: 0, comidas_30d: 0, planes: 0, mensajes_coach: 0,
                escaneos: 0, gasto_ia_30d_usd: 0, dias_activos_30d: 0 }),
            modo: 'plan', idioma: null, pais: null,
        }),
        fila({ user_id: D, email: 'dani@correo.com', nombre: 'Dani' }),
    ],
    total: 4, pagina: 1, por_pagina: 50, ...extra,
});
// La ficha del lote 774/775 (lo que devuelve el servidor con el interruptor APAGADO).
const fichaBase = (extra = {}) => ({
    user_id: A, email: 'ana@correo.com', nombre: 'Ana', alta: '2026-09-01T12:00:00+00:00',
    plan_pagado: 'gratis', plan_efectivo: 'gratis', es_admin: false,
    suscripcion: { estado: null, fin: null, paypal: false }, cortesia: null,
    creditos: { usados: 3, plan: 10, regalo: 0, tope: 10 }, coach: { usados: 0, plan: 40, regalo: 0, tope: 40 },
    regalos: [], validez_creditos: { mes: '2026-10-01T00:00:00+00:00', mes_siguiente: '2026-11-01T00:00:00+00:00' },
    ...extra,
});
// La ficha ampliada (contrato 3): la de hoy + actividad, ajustes, ajustes del dispositivo y prueba.
const fichaAmpliada = (extra = {}) => fichaBase({
    actividad: {
        ...actividad(), comidas_por_dia_activo: 2.93, dias_con_agua_30d: 5, registros_peso: 2,
        bloques_fallidos_30d: 1, pulgares_abajo: 1, plataformas: ['web', 'android'], avisos_abiertos: 0,
        embudo: {
            alta: '2026-09-01T12:00:00+00:00', formulario: '2026-09-01T12:10:00+00:00',
            primer_plan: '2026-09-02T09:00:00+00:00', primera_comida: '2026-09-02T13:00:00+00:00',
            primer_mensaje: null, primer_escaneo: null,
        },
        modo: 'tracking', idioma: 'es-DO', pais: 'DO',
    },
    ajustes: [
        { clave: 'plan_mode', etiqueta: 'Modo de uso', grupo: 'Uso', estado: 'valor', valor: 'tracking',
          cambiado_at: '2026-09-10T12:00:00+00:00', origen: 'app' },
        { clave: 'avisos_comida', etiqueta: 'Avisos de comida', grupo: 'Avisos', estado: 'apagado', valor: false,
          cambiado_at: '2026-09-21T10:00:00+00:00', origen: 'app' },
        { clave: 'water_tracker_enabled', etiqueta: 'Hidratación', grupo: 'Capacidades', estado: 'encendido',
          valor: true, cambiado_at: '2026-09-20T10:00:00+00:00', origen: 'coach' },
        { clave: 'nevera_enabled', etiqueta: 'Nevera', grupo: 'Capacidades', estado: 'automatico', valor: null,
          cambiado_at: '2026-09-22T10:00:00+00:00', origen: 'sistema' },
        { clave: 'analytics_consent', etiqueta: 'Analítica', grupo: 'Privacidad', estado: 'sin_elegir', valor: null,
          cambiado_at: '2026-09-23T10:00:00+00:00', origen: 'migracion' },
        { clave: 'avisos_siesta', etiqueta: 'avisos_siesta', grupo: 'Otros ajustes', estado: 'valor',
          valor: ['x', 1], cambiado_at: null, origen: null },
    ],
    ajustes_dispositivo: {
        web: { tema: 'dark', notificaciones_permiso: 'granted', alertas_activadas: true, pwa: true,
               unidad_altura: 'ft', app_build: 'web-240', at: '2026-09-29T08:00:00+00:00' },
    },
    prueba: null,
    ...extra,
});
const pruebaViva = (extra = {}) => ({
    estado: 'activa', desde: '2026-09-29T10:00:00+00:00', motivo: 'tester del beta',
    marcada_por: 'dueno@bioboros.com', aviso_visto_at: '2026-09-29T12:00:00+00:00', historial: [], ...extra,
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
const RUTA_LISTA = '/api/admin/cuentas?';
const pedidasDeLista = () => peticiones.filter((p) => p.url.startsWith(RUTA_LISTA))
    .map((p) => new URL(p.url, 'http://panel').searchParams);
const ultimaLista = () => pedidasDeLista().at(-1);
const montar = () => render(
    <MemoryRouter initialEntries={['/admin']}><Routes><Route path="/admin" element={<AdminPage />} /></Routes></MemoryRouter>,
);
async function abrirCuentas() {
    montar();
    fireEvent.click(await screen.findByRole('tab', { name: 'Cuentas' }));
}
const tabla = () => screen.findByRole('table', { name: 'Todas las cuentas' });
const filaDe = (t, correo) => within(t).getByRole('button', { name: correo }).closest('tr');
async function abrirFicha(correo = 'ana@correo.com') {
    fireEvent.click(within(await tabla()).getByRole('button', { name: correo }));
    return screen.findByRole('article', { name: `Cuenta ${correo}` });
}
const FOCOSABLES = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

describe('[833] /admin · Cuentas: la lista de todas las cuentas', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sin la lista (404: interruptor apagado) se queda la búsqueda por correo exacto de hoy, desde el primer render', async () => {
        servidor([]);
        await abrirCuentas();
        // El test del 775 busca el campo SÍNCRONAMENTE tras pulsar la pestaña: tiene que estar, y a la vista, en el
        // primer render (por rol: un campo oculto no cuenta).
        expect(screen.getByRole('textbox', { name: 'Correo de la cuenta' })).toBeInTheDocument();
        await waitFor(() => expect(pedidasDeLista().length).toBe(1));
        await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.queryByRole('heading', { name: 'Todas las cuentas' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Descargar CSV' })).toBeNull();
        expect(screen.queryByText('No se pudo cargar la lista de cuentas.')).toBeNull();   // un 404 no es un fallo
        expect(screen.getByText('Escribe el correo completo; no hay lista de cuentas. Cada búsqueda queda anotada.')).toBeInTheDocument();
        expect(pedidasDeLista().length).toBe(1);   // no insiste
    });

    it('con la lista (200) pinta una fila por cuenta con su correo, sus números y sus etiquetas, encima del buscador exacto', async () => {
        servidor([[RUTA_LISTA, async () => respuesta(lista())]]);
        await abrirCuentas();
        const t = await tabla();
        expect(ultimaLista().toString()).toBe('buscar=&orden=actividad&filtro=todas&pagina=1');
        const ana = filaDe(t, 'ana@correo.com');
        expect(within(ana).getByText('57')).toBeInTheDocument();                 // comidas registradas
        expect(within(ana).getByText('41 en 30 días')).toBeInTheDocument();
        expect(within(ana).getByText('12')).toBeInTheDocument();                 // mensajes al coach
        expect(within(ana).getByText('US$0.28')).toBeInTheDocument();            // gasto de IA, 2 decimales
        expect(within(filaDe(t, 'beto@correo.com')).getByText('US$1.50')).toBeInTheDocument();
        expect(within(filaDe(t, 'beto@correo.com')).getByText('Prueba')).toBeInTheDocument();
        const duena = filaDe(t, 'duena@bioboros.com');
        expect(within(duena).getByText('Admin')).toBeInTheDocument();
        expect(within(duena).getByText('Prueba')).toBeInTheDocument();
        expect(within(duena).getByText('Aviso pendiente')).toBeInTheDocument();
        expect(within(duena).getByText('Sin actividad')).toBeInTheDocument();
        expect(within(ana).queryByText('Prueba')).toBeNull();
        expect(screen.getByText('4 cuentas')).toBeInTheDocument();
        // El buscador exacto de hoy sigue, debajo, y ya no dice que no hay lista.
        expect(screen.getByLabelText('Correo de la cuenta')).toBeInTheDocument();
        expect(screen.queryByText(/no hay lista de cuentas/)).toBeNull();
        expect(t.compareDocumentPosition(screen.getByLabelText('Correo de la cuenta')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('el filtro, el orden, la búsqueda (con espera de 300 ms) y la página cambian lo que se pide', async () => {
        servidor([[RUTA_LISTA, async () => respuesta(lista({ total: 120 }))]]);
        await abrirCuentas();
        await tabla();
        fireEvent.change(screen.getByLabelText('Filtro'), { target: { value: 'prueba' } });
        await waitFor(() => expect(ultimaLista().get('filtro')).toBe('prueba'));
        fireEvent.change(screen.getByLabelText('Orden'), { target: { value: 'gasto' } });
        await waitFor(() => expect(ultimaLista().get('orden')).toBe('gasto'));
        expect(ultimaLista().get('filtro')).toBe('prueba');
        const campo = screen.getByLabelText('Buscar por correo o nombre');
        fireEvent.change(campo, { target: { value: 'an' } });
        await act(async () => { await new Promise((ok) => setTimeout(ok, 120)); });   // una pausa corta al teclear
        expect(ultimaLista().get('buscar')).toBe('');                            // todavía esperando
        fireEvent.change(campo, { target: { value: 'ana 50%' } });
        expect(ultimaLista().get('buscar')).toBe('');
        await waitFor(() => expect(ultimaLista().get('buscar')).toBe('ana 50%'));
        expect(pedidasDeLista().some((q) => q.get('buscar') === 'an')).toBe(false);   // una sola petición por ráfaga
        expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
        await waitFor(() => expect(ultimaLista().get('pagina')).toBe('2'));
        expect(ultimaLista().get('buscar')).toBe('ana 50%');
        // Cambiar el filtro vuelve a la primera página.
        fireEvent.change(screen.getByLabelText('Filtro'), { target: { value: 'activas_7d' } });
        await waitFor(() => expect(ultimaLista().get('filtro')).toBe('activas_7d'));
        expect(ultimaLista().get('pagina')).toBe('1');
    });

    it('si la lista falla al cargar lo dice y se puede reintentar', async () => {
        let veces = 0;
        servidor([[RUTA_LISTA, async () => { veces += 1; return veces === 1 ? respuesta({ detail: 'x' }, 503) : respuesta(lista()); }]]);
        await abrirCuentas();
        expect(await screen.findByText('No se pudo cargar la lista de cuentas.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
        expect(await tabla()).toBeInTheDocument();
    });

    it('seleccionar dos y marcarlas manda UN lote con esos ids, el motivo y la cabecera de acción', async () => {
        servidor([
            ['/api/admin/pruebas/lote', async () => respuesta({ ok: true, resultados: [
                { user_id: A, resultado: 'marcada' }, { user_id: D, resultado: 'salio_ella' },
            ] })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const t = await tabla();
        // Las que ya son de prueba no se pueden volver a marcar.
        expect(within(filaDe(t, 'beto@correo.com')).getByRole('checkbox')).toBeDisabled();
        const marcar = screen.getByRole('button', { name: 'Marcar seleccionadas como prueba' });
        expect(marcar).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar ana@correo.com' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar dani@correo.com' }));
        expect(screen.getByText('2 seleccionadas')).toBeInTheDocument();
        fireEvent.click(marcar);
        const dialogo = screen.getByRole('dialog', { name: 'Marcar 2 cuentas como de prueba' });
        expect(within(dialogo).getByText('ana@correo.com')).toBeInTheDocument();
        expect(within(dialogo).getByText('dani@correo.com')).toBeInTheDocument();
        const enviar = within(dialogo).getByRole('button', { name: 'Marcar 2 cuentas' });
        expect(enviar).toBeDisabled();                                           // falta el motivo
        fireEvent.change(within(dialogo).getByLabelText('Motivo'), { target: { value: 'testers del beta' } });
        const antes = pedidasDeLista().length;
        fireEvent.click(enviar);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const p = peticiones.find((x) => x.url === '/api/admin/pruebas/lote');
        expect(p.opciones.method).toBe('POST');
        expect(p.opciones.headers['X-Admin-Accion']).toBe('1');
        expect(JSON.parse(p.opciones.body)).toEqual({ user_ids: [A, D], motivo: 'testers del beta' });
        // Resultado por cuenta; la que salió ella misma se marca desde su ficha (pide confirmar la vuelta).
        expect(await screen.findByText('1 marcada · 1 salió ella misma')).toBeInTheDocument();
        const nota = screen.getByText(/Salieron ellas mismas del modo de prueba/).closest('[role="status"]');
        expect(within(nota).getByRole('button', { name: 'dani@correo.com' })).toBeInTheDocument();
        await waitFor(() => expect(pedidasDeLista().length).toBeGreaterThan(antes));   // la lista se refresca
        expect(screen.getByText('0 seleccionadas')).toBeInTheDocument();
    });

    it('«Seleccionar todas las de esta página» coge solo las que no están marcadas', async () => {
        servidor([[RUTA_LISTA, async () => respuesta(lista())]]);
        await abrirCuentas();
        await tabla();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todas las de esta página' }));
        expect(screen.getByRole('checkbox', { name: 'Seleccionar ana@correo.com' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Seleccionar dani@correo.com' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Seleccionar beto@correo.com' })).not.toBeChecked();
        expect(screen.getByText('2 seleccionadas')).toBeInTheDocument();
    });

    it('una seleccionada que pasa a ser de prueba mientras tanto (otra pestaña, otro admin) deja de estar seleccionada', async () => {
        let daniMarcada = false;
        const conDaniMarcada = () => lista({ cuentas: lista().cuentas.map((c) => (c.user_id === D
            ? { ...c, prueba: { estado: 'activa', desde: '2026-09-29T12:00:00+00:00' } } : c)) });
        servidor([
            [`/api/admin/cuentas/${A}/prueba`, async () => { daniMarcada = true; return respuesta({ ok: true, cuenta: fichaAmpliada({ prueba: pruebaViva() }) }); }],
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada() })],
            [RUTA_LISTA, async () => respuesta(daniMarcada ? conDaniMarcada() : lista())],
        ]);
        await abrirCuentas();
        await tabla();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar dani@correo.com' }));
        expect(screen.getByText('1 seleccionada')).toBeInTheDocument();
        const ficha = await abrirFicha();
        fireEvent.click(within(ficha).getByRole('button', { name: 'Marcar como cuenta de prueba' }));
        const dialogo = screen.getByRole('dialog', { name: 'Marcar como cuenta de prueba' });
        fireEvent.change(within(dialogo).getByLabelText('Motivo'), { target: { value: 'tester del beta' } });
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Marcar como prueba' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(() => expect(pedidasDeLista().length).toBe(2));            // la lista se refrescó, oculta
        fireEvent.click(screen.getByRole('button', { name: 'Volver a la lista' }));
        await tabla();
        const dani = screen.getByRole('checkbox', { name: 'Seleccionar dani@correo.com' });
        await waitFor(() => expect(dani).toBeDisabled());
        expect(dani).not.toBeChecked();
        expect(screen.getByText('0 seleccionadas')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Marcar seleccionadas como prueba' })).toBeDisabled();
    });

    it('el diálogo del lote atrapa el foco, ESC lo cierra y el foco vuelve al botón', async () => {
        servidor([[RUTA_LISTA, async () => respuesta(lista())]]);
        await abrirCuentas();
        await tabla();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar ana@correo.com' }));
        const marcar = screen.getByRole('button', { name: 'Marcar seleccionadas como prueba' });
        marcar.focus();
        fireEvent.click(marcar);
        const dialogo = screen.getByRole('dialog', { name: 'Marcar 1 cuenta como de prueba' });
        const focosables = [...dialogo.querySelectorAll(FOCOSABLES)];
        expect(focosables.length).toBeGreaterThan(1);
        focosables[0].focus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(focosables.at(-1));
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(focosables[0]);
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(document.activeElement).toBe(marcar);
    });

    it('«Descargar CSV» pide el CSV con los mismos filtros (sin página) y lo baja como archivo', async () => {
        const blob = new Blob(['\ufeffcorreo\r\n'], { type: 'text/csv' });
        servidor([
            ['/api/admin/cuentas.csv', async () => ({
                ok: true, status: 200, blob: async () => blob,
                headers: { get: (h) => (String(h).toLowerCase() === 'content-disposition' ? 'attachment; filename="cuentas-20260929.csv"' : null) },
            })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        const crear = vi.fn(() => 'blob:cuentas');
        const revocar = vi.fn();
        const originales = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };
        URL.createObjectURL = crear;
        URL.revokeObjectURL = revocar;
        let bajado = null;
        const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function registrar() {
            bajado = { href: this.getAttribute('href'), download: this.getAttribute('download'), enDocumento: document.body.contains(this) };
        });
        const temporizador = vi.spyOn(globalThis, 'setTimeout');
        try {
            await abrirCuentas();
            await tabla();
            fireEvent.change(screen.getByLabelText('Filtro'), { target: { value: 'prueba' } });
            await waitFor(() => expect(ultimaLista().get('filtro')).toBe('prueba'));
            const desde = temporizador.mock.calls.length;
            fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
            await waitFor(() => expect(clic).toHaveBeenCalledTimes(1));
            const q = new URL(peticiones.find((x) => x.url.startsWith('/api/admin/cuentas.csv')).url, 'http://panel').searchParams;
            expect(q.get('filtro')).toBe('prueba');
            expect(q.get('orden')).toBe('actividad');
            expect(q.get('buscar')).toBe('');
            expect(q.has('pagina')).toBe(false);
            expect(crear).toHaveBeenCalledWith(blob);
            expect(bajado).toEqual({ href: 'blob:cuentas', download: 'cuentas-20260929.csv', enDocumento: true });
            expect(document.querySelector('a[download]')).toBeNull();            // el enlace temporal se va
            // No se revoca en el acto (Safari cancelaba la descarga), pero sí se revoca.
            expect(revocar).not.toHaveBeenCalled();
            // (≥ 5 s: los 1 000 ms del `waitFor` de Testing Library no son nuestros.)
            const programadas = temporizador.mock.calls.slice(desde).filter(([, ms]) => ms >= 5000).map(([fn]) => fn);
            expect(programadas.length).toBe(1);
            programadas.forEach((fn) => fn());
            expect(revocar).toHaveBeenCalledWith('blob:cuentas');
        } finally {
            clic.mockRestore();
            temporizador.mockRestore();
            URL.createObjectURL = originales.crear;
            URL.revokeObjectURL = originales.revocar;
        }
    });

    it('en el teléfono cada fila es una tarjeta: cada celda lleva su rótulo y la hoja lo pinta bajo 640 px', async () => {
        servidor([[RUTA_LISTA, async () => respuesta(lista())]]);
        await abrirCuentas();
        const t = await tabla();
        const ana = filaDe(t, 'ana@correo.com');
        const rotulos = [...ana.querySelectorAll('td[data-etiqueta]')].map((td) => td.getAttribute('data-etiqueta'));
        expect(rotulos).toEqual(['Última actividad', 'Comidas', 'Planes', 'Mensajes al coach', 'Escaneos',
            'Gasto de IA (30 días)', 'Días activos (30 días)', 'Alta']);
        const css = readFileSync(resolve(process.cwd(), 'src/pages/AdminCuentasLista.module.css'), 'utf8');
        const movil = css.slice(css.indexOf('@media (max-width: 640px)'));
        expect(css.indexOf('@media (max-width: 640px)')).toBeGreaterThan(-1);
        expect(movil).toMatch(/\.tabla thead\s*\{[^}]*display:\s*none/);
        expect(movil).toMatch(/\.tabla tr\s*\{[^}]*display:\s*grid/);
        expect(movil).toMatch(/\[data-etiqueta\]::before\s*\{[^}]*content:\s*attr\(data-etiqueta\)/);
        // La tabla de escritorio se desplaza DENTRO de su caja, nunca la página.
        expect(css).toMatch(/\.desplazable\s*\{[^}]*overflow-x:\s*auto/);
    });
});

describe('[833] /admin · Cuentas: la ficha ampliada', () => {
    beforeEach(() => vi.clearAllMocks());

    it('tocar una cuenta abre su ficha en el sitio de la lista; «Volver a la lista» la devuelve con el foco en esa fila', async () => {
        servidor([
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada() })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const ficha = await abrirFicha();
        expect(peticiones.some((p) => p.url === `/api/admin/cuentas/${A}`)).toBe(true);
        expect(screen.queryByRole('table')).toBeNull();                           // la lista se aparta
        const volver = screen.getByRole('button', { name: 'Volver a la lista' });
        expect(document.activeElement).toBe(volver);
        expect(within(ficha).getByRole('heading', { name: 'ana@correo.com' })).toBeInTheDocument();
        fireEvent.click(volver);
        const t = await tabla();
        expect(document.activeElement).toBe(within(t).getByRole('button', { name: 'ana@correo.com' }));
        expect(screen.queryByRole('article')).toBeNull();
    });

    it('si se abren dos cuentas seguidas gana la última, aunque la primera responda después (nunca la ficha de otra)', async () => {
        let soltarAna;
        servidor([
            [`/api/admin/cuentas/${A}`, () => new Promise((ok) => { soltarAna = () => ok(respuesta({ cuenta: fichaAmpliada() })); })],
            [`/api/admin/cuentas/${D}`, async () => respuesta({ cuenta: fichaAmpliada({ user_id: D, email: 'dani@correo.com', nombre: 'Dani' }) })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const t = await tabla();
        fireEvent.click(within(t).getByRole('button', { name: 'ana@correo.com' }));
        expect(screen.getByText('Abriendo la cuenta…')).toBeInTheDocument();
        fireEvent.click(within(t).getByRole('button', { name: 'dani@correo.com' }));
        expect(await screen.findByRole('article', { name: 'Cuenta dani@correo.com' })).toBeInTheDocument();
        await act(async () => { soltarAna(); });
        expect(screen.getByRole('article', { name: 'Cuenta dani@correo.com' })).toBeInTheDocument();
        expect(screen.queryByRole('article', { name: 'Cuenta ana@correo.com' })).toBeNull();
    });

    it('Actividad: los números de la cuenta y el embudo con sus fechas (o «Todavía no»)', async () => {
        servidor([
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada() })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const ficha = await abrirFicha();
        const bloque = within(ficha).getByRole('region', { name: 'Actividad' });
        const dato = (etiqueta) => within(bloque).getByText(etiqueta).closest('[data-dato]');
        expect(within(dato('Comidas registradas')).getByText('57')).toBeInTheDocument();
        expect(within(dato('Comidas registradas')).getByText('41 en los últimos 30 días')).toBeInTheDocument();
        expect(within(dato('Gasto de IA (30 días)')).getByText('US$0.28')).toBeInTheDocument();
        expect(within(dato('Comidas por día activo')).getByText('2.9')).toBeInTheDocument();
        expect(within(dato('Bloques de plan fallidos (30 días)')).getByText('1')).toBeInTheDocument();
        expect(within(dato('Plataformas')).getByText('Web, Android')).toBeInTheDocument();
        expect(within(dato('Modo')).getByText('Seguimiento')).toBeInTheDocument();
        const embudo = within(bloque).getByRole('list', { name: 'Embudo' });
        const pasos = within(embudo).getAllByRole('listitem');
        expect(pasos.map((p) => p.getAttribute('data-hecho'))).toEqual(['true', 'true', 'true', 'true', 'false', 'false']);
        expect(within(pasos[4]).getByText('Primer mensaje al coach')).toBeInTheDocument();
        expect(within(pasos[4]).getByText('Todavía no')).toBeInTheDocument();
        expect(within(pasos[2]).queryByText('Todavía no')).toBeNull();
    });

    it('Ajustes: por grupo, con el estado en PALABRA (no solo color), cuándo cambió y quién («la persona / el coach / el sistema»)', async () => {
        servidor([
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada() })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const ficha = await abrirFicha();
        const ajustes = within(ficha).getByRole('region', { name: 'Ajustes' });
        const grupos = within(ajustes).getAllByRole('heading', { level: 5 }).map((h) => h.textContent);
        expect(grupos).toEqual(['Uso', 'Avisos', 'Capacidades', 'Privacidad', 'Otros ajustes', 'Ajustes del dispositivo']);
        const capacidades = within(ajustes).getByRole('region', { name: 'Capacidades' });
        const hidratacion = within(capacidades).getByText('Hidratación').closest('li');
        const estado = hidratacion.querySelector('[data-estado]');
        expect(estado).toHaveAttribute('data-estado', 'encendido');
        expect(estado).toHaveTextContent('Encendido');                           // la palabra, no solo el color
        expect(hidratacion).toHaveTextContent('(el coach)');
        const nevera = within(capacidades).getByText('Nevera').closest('li');
        expect(nevera.querySelector('[data-estado]')).toHaveTextContent('Automático');
        expect(nevera).toHaveTextContent('(el sistema)');
        const avisos = within(ajustes).getByRole('region', { name: 'Avisos' });
        const comida = within(avisos).getByText('Avisos de comida').closest('li');
        expect(comida.querySelector('[data-estado]')).toHaveTextContent('Apagado');
        expect(comida).toHaveTextContent('(la persona)');                     // `app`: quien lee es el admin, no «tú»
        expect(comida).not.toHaveTextContent('(tú)');
        const privacidad = within(ajustes).getByRole('region', { name: 'Privacidad' });
        const analitica = within(privacidad).getByText('Analítica').closest('li');
        expect(analitica.querySelector('[data-estado]')).toHaveTextContent('Sin elegir');
        expect(analitica).toHaveTextContent('(migracion)');                  // un origen que el panel no conoce, tal cual
        expect(within(within(ajustes).getByRole('region', { name: 'Uso' })).getByText('Seguimiento')).toBeInTheDocument();
        expect(within(within(ajustes).getByRole('region', { name: 'Otros ajustes' })).getByText('avisos_siesta')).toBeInTheDocument();
        for (const chip of ajustes.querySelectorAll('[data-estado]')) expect(chip.textContent.trim()).not.toBe('');
        // Ajustes del dispositivo, por plataforma.
        const dispositivo = within(ajustes).getByRole('region', { name: 'Ajustes del dispositivo' });
        const web = within(dispositivo).getByRole('heading', { name: /^Web/ }).closest('section');
        expect(within(web).getByText('Tema').closest('li')).toHaveTextContent('Oscuro');
        expect(within(web).getByText('Permiso de notificaciones').closest('li')).toHaveTextContent('Concedido');
        expect(within(web).getByText('Alertas del dispositivo').closest('li')).toHaveTextContent('Encendido');
        expect(within(web).getByText('Versión de la app').closest('li')).toHaveTextContent('web-240');
        // El formulario siembra `ft` para todos: el panel lo avisa junto al valor.
        const altura = within(web).getByText(/^Unidad de altura/).closest('li');
        expect(altura).toHaveTextContent('Unidad de altura (por defecto ft si no la cambió)');
        expect(altura.lastElementChild).toHaveTextContent('ft');
    });

    it('«Ver cambios» pide el historial de ajustes al abrirlo (90 días) y lo pinta en un panel plegable', async () => {
        servidor([
            [`/api/admin/cuentas/${A}/ajustes/historial`, async () => respuesta({ cambios: [
                { at: '2026-09-20T10:00:00+00:00', clave: 'water_tracker_enabled', etiqueta: 'Hidratación', antes: false, despues: true, origen: 'coach' },
                { at: '2026-09-10T12:00:00+00:00', clave: 'plan_mode', etiqueta: 'Modo de uso', antes: 'plan', despues: 'tracking', origen: 'app' },
            ] })],
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada() })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const ficha = await abrirFicha();
        const ver = within(ficha).getByRole('button', { name: 'Ver cambios' });
        expect(ver).toHaveAttribute('aria-expanded', 'false');
        expect(peticiones.some((p) => p.url.includes('/ajustes/historial'))).toBe(false);   // no se pide hasta abrirlo
        fireEvent.click(ver);
        expect(within(ficha).getByRole('button', { name: 'Ocultar cambios' })).toHaveAttribute('aria-expanded', 'true');
        const panel = await within(ficha).findByRole('list', { name: 'Cambios de ajustes' });
        expect(peticiones.find((p) => p.url.includes('/ajustes/historial')).url).toBe(`/api/admin/cuentas/${A}/ajustes/historial?dias=90`);
        const filas = within(panel).getAllByRole('listitem');
        expect(filas[0]).toHaveTextContent('Hidratación: Apagado → Encendido (el coach)');
        expect(filas[1]).toHaveTextContent('Modo de uso: Plan → Seguimiento (la persona)');
        fireEvent.change(within(ficha).getByLabelText('Periodo de los cambios'), { target: { value: '365' } });
        await waitFor(() => expect(peticiones.at(-1).url).toBe(`/api/admin/cuentas/${A}/ajustes/historial?dias=365`));
    });

    it('la ficha que trae el buscador exacto también sale ampliada; la del interruptor apagado queda como la del 774', async () => {
        let ampliada = true;
        servidor([['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ampliada ? fichaAmpliada() : fichaBase() })]]);
        await abrirCuentas();
        fireEvent.change(screen.getByLabelText('Correo de la cuenta'), { target: { value: 'ana@correo.com' } });
        fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
        let ficha = await screen.findByRole('article', { name: 'Cuenta ana@correo.com' });
        expect(within(ficha).getByRole('region', { name: 'Actividad' })).toBeInTheDocument();
        expect(within(ficha).getByRole('region', { name: 'Cuenta de prueba' })).toBeInTheDocument();
        ampliada = false;
        fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Actividad' })).toBeNull());
        ficha = await screen.findByRole('article', { name: 'Cuenta ana@correo.com' });
        expect(within(ficha).queryByRole('region', { name: 'Ajustes' })).toBeNull();
        expect(within(ficha).queryByRole('region', { name: 'Cuenta de prueba' })).toBeNull();
        expect(within(ficha).getByRole('heading', { name: 'Historial de regalos' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Volver a la lista' })).toBeNull();   // sin lista, sin «volver»
    });
});

describe('[833] /admin · Cuentas: la cuenta de prueba en la ficha', () => {
    beforeEach(() => vi.clearAllMocks());

    it('marcar pide motivo; si la persona salió ella, un SEGUNDO diálogo pide confirmar «La persona me pidió volver»', async () => {
        servidor([
            [`/api/admin/cuentas/${A}/prueba`, async (url, op) => {
                const cuerpo = JSON.parse(op.body);
                if (!cuerpo.confirmar_vuelta) return respuesta({ detail: 'salio_ella' }, 409);
                return respuesta({ ok: true, cuenta: fichaAmpliada({ prueba: pruebaViva({ estado: 'aviso_pendiente', aviso_visto_at: null, motivo: cuerpo.motivo }) }) });
            }],
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada() })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const ficha = await abrirFicha();
        const bloque = within(ficha).getByRole('region', { name: 'Cuenta de prueba' });
        expect(within(bloque).getByText('No es una cuenta de prueba.')).toBeInTheDocument();
        fireEvent.click(within(bloque).getByRole('button', { name: 'Marcar como cuenta de prueba' }));
        const primero = screen.getByRole('dialog', { name: 'Marcar como cuenta de prueba' });
        const marcar = within(primero).getByRole('button', { name: 'Marcar como prueba' });
        expect(marcar).toBeDisabled();
        fireEvent.change(within(primero).getByLabelText('Motivo'), { target: { value: 'tester del beta' } });
        fireEvent.click(marcar);
        const segundo = await screen.findByRole('dialog', { name: 'Esta persona salió ella misma del modo de prueba' });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);                   // el primero se cerró
        const volver = within(segundo).getByRole('button', { name: 'Volver a marcarla' });
        expect(volver).toBeDisabled();                                           // hasta confirmarlo aparte
        fireEvent.click(within(segundo).getByLabelText('La persona me pidió volver'));
        fireEvent.click(volver);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const posts = peticiones.filter((p) => p.url === `/api/admin/cuentas/${A}/prueba`);
        expect(posts.map((p) => JSON.parse(p.opciones.body))).toEqual([
            { motivo: 'tester del beta', confirmar_vuelta: false },
            { motivo: 'tester del beta', confirmar_vuelta: true },
        ]);
        for (const p of posts) {
            expect(p.opciones.method).toBe('POST');
            expect(p.opciones.headers['X-Admin-Accion']).toBe('1');
        }
        const nuevo = within(screen.getByRole('article', { name: 'Cuenta ana@correo.com' })).getByRole('region', { name: 'Cuenta de prueba' });
        expect(within(nuevo).getByText('Esperando a que vea el aviso en la app.')).toBeInTheDocument();
        expect(within(nuevo).getByText('Motivo: «tester del beta»')).toBeInTheDocument();
        expect(screen.getByText('Cambio guardado y anotado.')).toBeInTheDocument();
    });

    it('el diálogo de marcar atrapa el foco y ESC lo cierra', async () => {
        servidor([
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada() })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const ficha = await abrirFicha();
        fireEvent.click(within(ficha).getByRole('button', { name: 'Marcar como cuenta de prueba' }));
        const dialogo = screen.getByRole('dialog', { name: 'Marcar como cuenta de prueba' });
        const focosables = [...dialogo.querySelectorAll(FOCOSABLES)];
        expect(focosables.length).toBeGreaterThan(1);
        focosables[0].focus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(focosables.at(-1));
        expect(dialogo.contains(document.activeElement)).toBe(true);
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('un «ya_marcada» del servidor se explica dentro del diálogo', async () => {
        servidor([
            [`/api/admin/cuentas/${A}/prueba`, async () => respuesta({ detail: 'ya_marcada' }, 409)],
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada() })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const ficha = await abrirFicha();
        fireEvent.click(within(ficha).getByRole('button', { name: 'Marcar como cuenta de prueba' }));
        const dialogo = screen.getByRole('dialog', { name: 'Marcar como cuenta de prueba' });
        fireEvent.change(within(dialogo).getByLabelText('Motivo'), { target: { value: 'tester' } });
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Marcar como prueba' }));
        expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Esta cuenta ya estaba marcada como de prueba.');
    });

    it('con la marca: desde cuándo, quién, el motivo, si vio el aviso y el historial; «Quitar marca» pide motivo', async () => {
        const marcada = fichaAmpliada({ prueba: pruebaViva({ historial: [
            { desde: '2026-09-29T10:00:00+00:00', hasta: null, motivo: 'tester del beta', motivo_quitar: null, quitada_por_la_persona: false, marcada_por: 'dueno@bioboros.com' },
            { desde: '2026-09-02T10:00:00+00:00', hasta: '2026-09-15T10:00:00+00:00', motivo: 'primera ronda', motivo_quitar: null, quitada_por_la_persona: true, marcada_por: 'dueno@bioboros.com' },
        ] }) });
        servidor([
            [`/api/admin/cuentas/${A}/prueba/quitar`, async () => respuesta({ ok: true, cuenta: fichaAmpliada({ prueba: null }) })],
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: marcada })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const ficha = await abrirFicha();
        const bloque = within(ficha).getByRole('region', { name: 'Cuenta de prueba' });
        expect(within(bloque).getByText(/^Cuenta de prueba desde el /)).toBeInTheDocument();
        expect(within(bloque).getByText('Marcada por dueno@bioboros.com')).toBeInTheDocument();
        expect(within(bloque).getByText('Motivo: «tester del beta»')).toBeInTheDocument();
        expect(within(bloque).getByText(/^La persona vio el aviso el /)).toBeInTheDocument();
        const historial = within(bloque).getByRole('list', { name: 'Historial de la marca' });
        const entradas = within(historial).getAllByRole('listitem');
        expect(entradas).toHaveLength(2);
        expect(entradas[0]).toHaveTextContent('vigente');
        expect(entradas[1]).toHaveTextContent('salió la propia persona');
        fireEvent.click(within(bloque).getByRole('button', { name: 'Quitar marca' }));
        const dialogo = screen.getByRole('dialog', { name: 'Quitar la marca de prueba' });
        fireEvent.change(within(dialogo).getByLabelText('Motivo'), { target: { value: 'terminó la prueba' } });
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar la marca' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const p = peticiones.find((x) => x.url === `/api/admin/cuentas/${A}/prueba/quitar`);
        expect(JSON.parse(p.opciones.body)).toEqual({ motivo: 'terminó la prueba' });
        expect(p.opciones.headers['X-Admin-Accion']).toBe('1');
        expect(await screen.findByText('No es una cuenta de prueba.')).toBeInTheDocument();
    });

    it('con el aviso pendiente lo dice: «Esperando a que vea el aviso en la app»', async () => {
        servidor([
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada({ prueba: pruebaViva({ estado: 'aviso_pendiente', aviso_visto_at: null }) }) })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        const ficha = await abrirFicha();
        const bloque = within(ficha).getByRole('region', { name: 'Cuenta de prueba' });
        expect(within(bloque).getByText('Esperando a que vea el aviso en la app.')).toBeInTheDocument();
        expect(within(bloque).getByText('Aviso pendiente')).toBeInTheDocument();
    });

    it('«Ver detalle» abre el detalle como estado de la página (sin rutas) y «Volver a la ficha» la devuelve', async () => {
        servidor([
            [`/api/admin/cuentas/${A}`, async () => respuesta({ cuenta: fichaAmpliada({ prueba: pruebaViva() }) })],
            [RUTA_LISTA, async () => respuesta(lista())],
        ]);
        await abrirCuentas();
        await tabla();
        fireEvent.change(screen.getByLabelText('Filtro'), { target: { value: 'prueba' } });
        await waitFor(() => expect(ultimaLista().get('filtro')).toBe('prueba'));
        const ficha = await abrirFicha();
        fireEvent.click(within(ficha).getByRole('button', { name: 'Ver detalle' }));
        const detalle = screen.getByRole('region', { name: 'Detalle de ana@correo.com' });
        expect(document.activeElement).toBe(detalle);
        expect(detalle).toHaveAttribute('data-detalle-prueba', A);
        expect(screen.queryByRole('article', { name: 'Cuenta ana@correo.com' })).toBeNull();
        expect(screen.queryByRole('textbox', { name: 'Correo de la cuenta' })).toBeNull();   // oculto, no desmontado
        fireEvent.click(within(detalle).getByRole('button', { name: 'Volver a la ficha' }));
        expect(screen.getByRole('article', { name: 'Cuenta ana@correo.com' })).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Detalle de ana@correo.com' })).toBeNull();
        expect(document.activeElement).toBe(within(screen.getByRole('article', { name: 'Cuenta ana@correo.com' })).getByRole('button', { name: 'Ver detalle' }));
        // Nada se desmontó por el camino: la lista vuelve con su filtro, sin volver a empezar.
        const pedidas = pedidasDeLista().length;
        fireEvent.click(screen.getByRole('button', { name: 'Volver a la lista' }));
        await tabla();
        expect(screen.getByLabelText('Filtro')).toHaveValue('prueba');
        expect(pedidasDeLista().length).toBe(pedidas);
    });
});
