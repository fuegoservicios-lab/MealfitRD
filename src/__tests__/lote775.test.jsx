// frontend/src/__tests__/lote775.test.jsx
// [P1-PLAN-LOTE-775 · 2026-09-28] /admin · Cuentas: buscar por correo exacto, ficha, regalar créditos o una cortesía y
// revertir. Cada acción pide motivo, enseña el efecto y manda la cabecera X-Admin-Accion.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';

const UID = '33333333-3333-3333-3333-333333333333';
const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const ficha = (extra = {}) => ({
    user_id: UID, email: 'ana@correo.com', nombre: 'Ana', alta: '2026-09-01T00:00:00+00:00',
    plan_pagado: 'basic', plan_efectivo: 'basic', es_admin: false,
    suscripcion: { estado: null, fin: null, paypal: false }, cortesia: null,
    creditos: { usados: 3, plan: 50, regalo: 0, tope: 50 }, coach: { usados: 0, plan: 300, regalo: 0, tope: 300 },
    regalos: [], validez_creditos: { mes: '2026-10-01T00:00:00+00:00', mes_siguiente: '2026-11-01T00:00:00+00:00' },
    ...extra,
});
let peticiones;
function servidor(rutas) {
    peticiones = [];
    fetchWithAuth.mockImplementation(async (url, opciones = {}) => {
        peticiones.push({ url, opciones });
        if (url.startsWith('/api/admin/yo')) return respuesta({ ok: true });
        if (url.startsWith('/api/admin/metricas')) return respuesta({ dias: 7, generado: '2026-09-28T04:00:00+00:00', bloques: [] });
        for (const [prefijo, fn] of rutas) if (url.startsWith(prefijo)) return fn(url, opciones);
        return respuesta({ detail: 'no' }, 404);
    });
}
const montar = () => render(
    <MemoryRouter initialEntries={['/admin']}><Routes><Route path="/admin" element={<AdminPage />} /></Routes></MemoryRouter>,
);
async function buscar(correo = 'ana@correo.com') {
    montar();
    fireEvent.click(await screen.findByRole('tab', { name: 'Cuentas' }));
    fireEvent.change(screen.getByLabelText('Correo de la cuenta'), { target: { value: correo } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
}
const ultima = () => peticiones[peticiones.length - 1];

describe('[775] /admin · Cuentas', () => {
    it('recarga iPhone gratuitamente sin cambiar la suscripción y conserva la clave al reintentar', async () => {
        const free = { creditos: { usados: 90, regalo: 0, tope: 100 }, coach: { usados: 800, regalo: 0, tope: 1000 } };
        const attempts = [];
        servidor([
            ['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha({ ios_gratis: free }) })],
            [`/api/admin/cuentas/${UID}/ios-gratis/recargar`, async (_url, options) => {
                attempts.push(JSON.parse(options.body));
                return attempts.length === 1 ? respuesta({ detail: 'Intenta de nuevo' }, 503) : respuesta({ cuenta: ficha({ ios_gratis: free }) });
            }],
        ]);
        await buscar();
        fireEvent.click(await screen.findByRole('button', { name: 'Añadir recarga gratuita' }));
        const dialog = screen.getByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Continuidad gratuita' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir recarga gratuita' }));
        await screen.findByText('Intenta de nuevo');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir recarga gratuita' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(attempts).toHaveLength(2);
        expect(attempts[0]).toEqual(attempts[1]);
        expect(attempts[0].request_id).toMatch(/^[\da-f-]{36}$/);
        expect(attempts[0]).not.toHaveProperty('plan');
    });
    beforeEach(() => vi.clearAllMocks());

    it('la pestaña cambia la vista y la búsqueda manda el correo con la cabecera de acción', async () => {
        servidor([['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha() })]]);
        await buscar();
        expect(await screen.findByRole('heading', { name: 'ana@correo.com' })).toBeInTheDocument();
        const p = peticiones.find((x) => x.url === '/api/admin/cuentas/buscar');
        expect(p.opciones.method).toBe('POST');
        expect(p.opciones.headers['X-Admin-Accion']).toBe('1');
        expect(JSON.parse(p.opciones.body)).toEqual({ email: 'ana@correo.com' });
        expect(screen.queryByRole('group', { name: 'Periodo' })).toBeNull();
    });

    it('sin cuenta lo dice', async () => {
        servidor([['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: null })]]);
        await buscar('nadie@x.com');
        expect(await screen.findByText('No hay ninguna cuenta con ese correo.')).toBeInTheDocument();
    });

    it('regalar créditos: motivo obligatorio, efecto a la vista y la ficha se actualiza', async () => {
        servidor([
            ['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha() })],
            [`/api/admin/cuentas/${UID}/creditos`, async () => respuesta({ ok: true, cuenta: ficha({ creditos: { usados: 3, plan: 50, regalo: 20, tope: 70 } }) })],
        ]);
        await buscar();
        fireEvent.click(await screen.findByRole('button', { name: 'Regalar créditos' }));
        const dialogo = screen.getByRole('dialog', { name: 'Regalar créditos' });
        fireEvent.change(within(dialogo).getByLabelText('Cantidad'), { target: { value: '20' } });
        expect(within(dialogo).getByText('3/50 → 3/70')).toBeInTheDocument();
        const enviar = within(dialogo).getByRole('button', { name: 'Regalar 20 créditos' });
        expect(enviar).toBeDisabled();
        fireEvent.change(within(dialogo).getByLabelText('Motivo'), { target: { value: 'compensación' } });
        expect(enviar).toBeEnabled();
        fireEvent.click(enviar);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(JSON.parse(ultima().opciones.body)).toEqual({ medidor: 'generacion', modo: 'sumar', cantidad: 20, hasta: 'mes', motivo: 'compensación' });
        expect(screen.getByText('incluye +20 de regalo')).toBeInTheDocument();
    });

    it('recargar al completo propone justo lo gastado del plan', async () => {
        servidor([
            ['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha() })],
            [`/api/admin/cuentas/${UID}/creditos`, async () => respuesta({ ok: true, cuenta: ficha() })],
        ]);
        await buscar();
        fireEvent.click(await screen.findByRole('button', { name: 'Recargar al completo' }));
        const dialogo = screen.getByRole('dialog', { name: 'Recargar al completo' });
        fireEvent.change(within(dialogo).getByLabelText('Motivo'), { target: { value: 'fallo del 27' } });
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Recargar 3' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(JSON.parse(ultima().opciones.body)).toEqual({ medidor: 'generacion', modo: 'completo', hasta: 'mes', motivo: 'fallo del 27' });
    });

    it('cortesía: solo planes mejores que el pagado, y fecha o «sin fecha»', async () => {
        servidor([
            ['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha() })],
            [`/api/admin/cuentas/${UID}/cortesia`, async () => respuesta({ ok: true, cuenta: ficha({ plan_efectivo: 'plus', cortesia: { plan: 'plus', hasta: null } }) })],
        ]);
        await buscar();
        fireEvent.click(await screen.findByRole('button', { name: 'Plan de cortesía' }));
        const dialogo = screen.getByRole('dialog', { name: 'Dar un plan de cortesía' });
        const opciones = within(within(dialogo).getByLabelText('Plan')).getAllByRole('option').map((o) => o.textContent);
        expect(opciones).toEqual(['Plus', 'Max']);
        fireEvent.change(within(dialogo).getByLabelText('Motivo'), { target: { value: 'tester del beta' } });
        const dar = within(dialogo).getByRole('button', { name: 'Dar Plus de cortesía' });
        expect(dar).toBeDisabled();                              // falta la fecha o «sin fecha»
        fireEvent.click(within(dialogo).getByLabelText('Sin fecha de fin'));
        expect(dar).toBeEnabled();
        fireEvent.click(dar);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(JSON.parse(ultima().opciones.body)).toEqual({ plan: 'plus', hasta: null, motivo: 'tester del beta' });
        expect(screen.getByText(/Cortesía sin fecha de fin/)).toBeInTheDocument();
    });

    it('revertir desde el historial', async () => {
        const regalo = { id: 'g1', tipo: 'plan', detalle: 'Plus de cortesía', desde: null, hasta: null, motivo: 'beta', estado: 'vigente', motivo_reversion: null };
        servidor([
            ['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha({ regalos: [regalo] }) })],
            ['/api/admin/regalos/g1/revocar', async () => respuesta({ ok: true, cuenta: ficha({ regalos: [{ ...regalo, estado: 'revertido' }] }) })],
        ]);
        await buscar();
        fireEvent.click(await screen.findByRole('button', { name: 'Revertir' }));
        const dialogo = screen.getByRole('dialog', { name: 'Revertir un regalo' });
        fireEvent.change(within(dialogo).getByLabelText('Motivo'), { target: { value: 'se acabó la prueba' } });
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Revertir el regalo' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(ultima().url).toBe('/api/admin/regalos/g1/revocar');
        expect(screen.queryByRole('button', { name: 'Revertir' })).toBeNull();
    });

    it('una cuenta de administración no tiene acciones', async () => {
        servidor([['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha({ es_admin: true, plan_pagado: 'admin', plan_efectivo: 'admin' }) })]]);
        await buscar();
        expect(await screen.findByText('Es una cuenta de administración: no se le regala nada.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Regalar créditos' })).toBeNull();
    });

    it('un error del servidor se ve dentro del diálogo', async () => {
        servidor([
            ['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha() })],
            [`/api/admin/cuentas/${UID}/creditos`, async () => respuesta({ detail: 'No se pudo registrar la acción; no se hizo ningún cambio.' }, 503)],
        ]);
        await buscar();
        fireEvent.click(await screen.findByRole('button', { name: 'Regalar créditos' }));
        const dialogo = screen.getByRole('dialog', { name: 'Regalar créditos' });
        fireEvent.change(within(dialogo).getByLabelText('Motivo'), { target: { value: 'compensación' } });
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Regalar 10 créditos' }));
        expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No se pudo registrar la acción');
    });

    it('el diálogo atrapa el foco (Tab no se escapa a la Ficha detrás del velo) y ESC lo cierra', async () => {
        // [FIX ROUND 1 · 2026-09-28] Sin useModalAccessibility, Tab/Shift+Tab se escapaba del diálogo a los
        // botones de acción de la Ficha (Regalar créditos / Recargar al completo / Plan de cortesía) detrás
        // del velo — activar uno cambiaba `accion` sobre el mismo diálogo abierto.
        servidor([['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha() })]]);
        await buscar();
        fireEvent.click(await screen.findByRole('button', { name: 'Regalar créditos' }));
        const dialogo = screen.getByRole('dialog', { name: 'Regalar créditos' });

        const focosables = [...dialogo.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        )];
        expect(focosables.length).toBeGreaterThan(1);
        const primero = focosables[0];
        const ultimo = focosables[focosables.length - 1];

        primero.focus();
        expect(document.activeElement).toBe(primero);
        // El hook escucha en `document` (useModalAccessibility.js: `document.addEventListener('keydown', ...)`),
        // igual que lo haría el navegador — de ahí la re-focalización de Shift+Tab desde el PRIMER focosable.
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(ultimo);
        expect(dialogo.contains(document.activeElement)).toBe(true);
        // Los botones de la Ficha (detrás del velo) siguen sin foco y el diálogo sigue siendo el mismo.
        expect(screen.getByRole('dialog', { name: 'Regalar créditos' })).toBe(dialogo);

        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    // [Revisión final · 2026-09-28] El último día de un regalo se fija a la hora de RD (`ultimoDiaDeRegalo`), no a la
    // del dispositivo: visto desde Madrid, una cortesía que acaba el 1-oct 00:00 de RD y unos créditos que acaban el
    // 1-oct 00:00 UTC decían «1 oct». Se simula un dispositivo en Madrid (el huso por defecto de Intl), así el test
    // no depende del huso de la máquina que lo corre.
    it('el último día de un regalo sale en hora de RD, esté donde esté quien mira', async () => {
        const Original = Intl.DateTimeFormat;
        Intl.DateTimeFormat = function DateTimeFormat(loc, opts) {
            return new Original(loc, { timeZone: 'Europe/Madrid', ...(opts || {}) });
        };
        try {
            servidor([['/api/admin/cuentas/buscar', async () => respuesta({ cuenta: ficha({
                plan_efectivo: 'plus', cortesia: { plan: 'plus', hasta: '2026-10-01T04:00:00+00:00' },
                regalos: [{ id: 'g1', tipo: 'creditos_generacion', detalle: '+20 créditos de planes', desde: null,
                    hasta: '2026-10-01T00:00:00+00:00', motivo: 'compensación', estado: 'vigente', motivo_reversion: null }],
            }) })]]);
            await buscar();
            const dia = new Original('es-DO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santo_Domingo' })
                .format(new Date('2026-09-30T12:00:00Z'));
            expect(await screen.findByText(`Cortesía hasta el ${dia} · paga Básico`)).toBeInTheDocument();
            expect(screen.getByText(`Vigente · hasta el ${dia} · «compensación»`)).toBeInTheDocument();
        } finally {
            Intl.DateTimeFormat = Original;
        }
    });
});
