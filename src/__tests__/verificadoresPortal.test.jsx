import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import VerificadoresPage from '../pages/VerificadoresPage';
import AdminCuentasLista from '../pages/AdminCuentasLista';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import { fecha, hora } from '../utils/adminCuentas';

vi.mock('../config/api', () => ({
    api: (p) => p,
    fetchWithAuth: vi.fn(),
}));

vi.mock('../authClient', () => ({
    authClient: { auth: { signInWithOAuth: vi.fn() } },
    sendEmailOtp: vi.fn(),
}));

vi.mock('../utils/firstPartySession', () => ({
    verifyEmailOtpFirstParty: vi.fn(),
}));

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: vi.fn(() => ({
        session: null,
        loadingAuth: false,
        loadingData: false,
        loadingProfile: false,
        userProfile: null,
        planData: null,
        isGuest: false,
    })),
}));

import { fetchWithAuth } from '../config/api';
import { sendEmailOtp } from '../authClient';
import { verifyEmailOtpFirstParty } from '../utils/firstPartySession';

const jsonRes = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

function DestinoProbe() {
    const loc = useLocation();
    return <p>DESTINO:{loc.pathname}{loc.search}</p>;
}

describe('Portal /verificadores, redirección de /admin y chip Verificador Android', () => {
    const fetchOriginal = globalThis.fetch;

    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        globalThis.fetch = fetchOriginal;
    });

    it('redirige /admin sin sesión al login interno /verificadores?acceso=admin y no al /login público', () => {
        render(
            <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                    <Route path="/admin" element={<ProtectedRoute><p>ADMIN</p></ProtectedRoute>} />
                    <Route path="/verificadores" element={<DestinoProbe />} />
                    <Route path="/login" element={<p>LOGIN_PUBLICO</p>} />
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.getByText('DESTINO:/verificadores?acceso=admin')).toBeInTheDocument();
        expect(screen.queryByText('LOGIN_PUBLICO')).not.toBeInTheDocument();
    });

    it('bloquea con login minimalista antes de mostrar verificadores y tras autenticar muestra solo métricas de uso', async () => {
        globalThis.fetch
            .mockResolvedValueOnce(jsonRes({ autenticado: false, usuario: null, configurado: true }))
            .mockResolvedValueOnce(jsonRes({ detail: 'Usuario o contraseña incorrectos.' }, 401))
            .mockResolvedValueOnce(jsonRes({ ok: true, usuario: 'equipo1' }))
            .mockResolvedValueOnce(jsonRes({
                resumen: {
                    total: 10, meta_google_play: 12, faltan: 2,
                    activos_7d: 7, con_actividad: 8, cumplen_14d: 4, dias_meta: 14,
                },
                verificadores: [
                    {
                        email: 'tester@gmail.com',
                        nombre: 'Ana Tester',
                        alta: '2026-11-01T10:00:00Z',
                        activo_7d: true,
                        cumple_14d: true,
                        actividad: {
                            ultima: '2026-11-21T14:00:00Z',
                            dias_activos_30d: 14,
                            comidas_total: 22,
                            comidas_30d: 18,
                            mensajes_coach: 9,
                            escaneos: 5,
                        },
                    },
                ],
                total_filtrado: 1,
            }));

        render(
            <MemoryRouter initialEntries={['/verificadores']}>
                <VerificadoresPage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByLabelText('Usuario')).toBeInTheDocument());
        expect(screen.queryByText('tester@gmail.com')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'equipo1' } });
        fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'mal' } });
        fireEvent.submit(screen.getByRole('button', { name: 'Entrar' }).closest('form'));

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('incorrectos'));

        fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ClaveSegura123!' } });
        fireEvent.submit(screen.getByRole('button', { name: 'Entrar' }).closest('form'));

        await waitFor(() => expect(screen.getByText('10 / 12')).toBeInTheDocument());
        expect(screen.getByText('Faltan 2 verificadores')).toBeInTheDocument();
        expect(screen.getByText('tester@gmail.com')).toBeInTheDocument();
        expect(screen.getByText('Cumple 14d')).toBeInTheDocument();
        expect(screen.queryByText(/gasto/i)).not.toBeInTheDocument();
    });

    it('en la pestaña Administrador permite login minimalista con Google o código OTP por correo', async () => {
        globalThis.fetch.mockResolvedValueOnce(jsonRes({ autenticado: false, usuario: null, configurado: false }));
        sendEmailOtp.mockResolvedValueOnce({ error: null });
        verifyEmailOtpFirstParty.mockResolvedValueOnce({ error: null });

        render(
            <MemoryRouter initialEntries={['/verificadores?acceso=admin']}>
                <VerificadoresPage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByRole('button', { name: /Continuar con Google/i })).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Correo de administrador'), { target: { value: 'admin@bioboros.com' } });
        fireEvent.submit(screen.getByRole('button', { name: 'Enviar código' }).closest('form'));

        await waitFor(() => expect(sendEmailOtp).toHaveBeenCalledWith('admin@bioboros.com'));
        await waitFor(() => expect(screen.getByLabelText('Código de verificación')).toBeInTheDocument());
    });

    it('muestra el filtro Verificadores Android, el chip y el progreso Google Play en AdminCuentasLista', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            const u = String(url);
            if (u.includes('filtro=verificadores_android')) {
                return jsonRes({
                    cuentas: [
                        {
                            user_id: '11111111-1111-4111-8111-111111111111',
                            email: 'android@gmail.com',
                            nombre: 'Tester Android',
                            alta: '2026-11-01T10:00:00Z',
                            plan_pagado: 'gratis',
                            plan_efectivo: 'gratis',
                            es_admin: false,
                            verificador_android: true,
                            prueba: null,
                            actividad: {
                                ultima: '2026-11-21T12:00:00Z',
                                comidas_total: 8,
                                comidas_30d: 8,
                                planes: 0,
                                mensajes_coach: 4,
                                escaneos: 2,
                                gasto_ia_30d_usd: 0.12,
                                dias_activos_30d: 5,
                                dias_continuos: 5,
                            },
                            modo: 'tracking',
                            idioma: 'es-DO',
                            pais: 'DO',
                        },
                    ],
                    total: 10,
                    pagina: 1,
                    por_pagina: 50,
                });
            }
            return jsonRes({ cuentas: [], total: 0, pagina: 1, por_pagina: 50 });
        });

        render(
            <MemoryRouter>
                <AdminCuentasLista oculta={false} version={0} onAbrir={() => {}} onDisponible={() => {}} />
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByLabelText('Filtro')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Filtro'), { target: { value: 'verificadores_android' } });

        await waitFor(() => expect(screen.getByText('android@gmail.com')).toBeInTheDocument());
        expect(screen.getByText('Verificador Android')).toBeInTheDocument();
        expect(screen.getByText('Días activos continuos')).toBeInTheDocument();
        expect(screen.getByText('5 de 14 seguidos')).toBeInTheDocument();
        expect(screen.getByText('Google Play: 10 / 12 verificadores Android')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Link del panel' })).toBeInTheDocument();

        const celdaUltimoUso = screen.getByText('android@gmail.com').closest('tr')?.querySelector('td[data-etiqueta="Último uso"]');
        expect(celdaUltimoUso).toBeTruthy();
        const spansUltimoUso = Array.from(celdaUltimoUso.querySelectorAll('span'));
        expect(spansUltimoUso).toHaveLength(2);
        expect(hora('2026-11-21T12:00:00Z')).not.toBe('');
        expect(spansUltimoUso[0].textContent).toBe(fecha('2026-11-21T12:00:00Z'));
        expect(spansUltimoUso[1].textContent).toBe(hora('2026-11-21T12:00:00Z'));
    });
});
