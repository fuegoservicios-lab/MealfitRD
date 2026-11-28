import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClasificatoriaPage from '../pages/ClasificatoriaPage';

const mocks = vi.hoisted(() => ({
    pedirClasificatoria: vi.fn(),
    compararConRival: vi.fn(),
    guardarPerfilJuego: vi.fn(),
    compartirClasificatoria: vi.fn(),
    leerClasificatoriaGuardada: vi.fn(),
    invalidarCacheClasificatoria: vi.fn(),
    assessment: {
        isGuest: false,
        session: { user: { id: '11111111-1111-1111-1111-111111111111' } },
        userProfile: { id: '11111111-1111-1111-1111-111111111111', health_profile: { country: 'DO' } },
    },
}));

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => mocks.assessment,
}));

vi.mock('../utils/progresoServidor', () => ({
    pedirClasificatoria: (...a) => mocks.pedirClasificatoria(...a),
    compararConRival: (...a) => mocks.compararConRival(...a),
    guardarPerfilJuego: (...a) => mocks.guardarPerfilJuego(...a),
    leerClasificatoriaGuardada: (...a) => mocks.leerClasificatoriaGuardada(...a),
    invalidarCacheClasificatoria: (...a) => mocks.invalidarCacheClasificatoria(...a),
}));

vi.mock('../utils/compartirClasificatoria', () => ({
    compartirClasificatoria: (...a) => mocks.compartirClasificatoria(...a),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

const DATOS_BASE = {
    temporada: {
        week_start: '2026-11-22',
        week_end: '2026-11-28',
        cierra_en_s: 172800,
        modo_sala: 'arena_abierta',
        nombre_sala: 'arena_abierta',
        total_jugadores: 4,
        bonos_podio: [45, 30, 15],
        minimo_podio_pts: 60,
    },
    tab: 'semanal',
    scope: 'global',
    mi_perfil: {
        user_id: '44444444-4444-4444-4444-444444444444',
        alias: 'Angel T.',
        display_alias: '',
        opt_in: true,
        country_code: 'DO',
        posicion: 4,
        rank_key: 'plata',
        rank_division: 2,
        puntos_semana: 70,
        puntos_total: 1120,
        racha: 6,
        mejor_racha: 10,
        semanas_perfectas: 1,
        rival_arriba: { user_id: '33333333-3333-3333-3333-333333333333', alias: 'Luis R.', posicion: 3, valor: 90, diferencia: 20 },
    },
    podio: [
        { user_id: '11111111-1111-1111-1111-111111111111', posicion: 1, es_yo: false, alias: 'Carla M.', iniciales: 'CM', country_code: 'DO', rank_key: 'oro', rank_division: 2, puntos_semana: 190, puntos_total: 3200, racha: 21 },
        { user_id: '22222222-2222-2222-2222-222222222222', posicion: 2, es_yo: false, alias: 'Atleta #8192', iniciales: 'AT', country_code: 'MX', rank_key: 'oro', rank_division: 1, puntos_semana: 140, puntos_total: 2400, racha: 12 },
        { user_id: '33333333-3333-3333-3333-333333333333', posicion: 3, es_yo: false, alias: 'Luis R.', iniciales: 'LR', country_code: 'DO', rank_key: 'plata', rank_division: 3, puntos_semana: 90, puntos_total: 1500, racha: 8 },
    ],
    tabla: [
        { user_id: '11111111-1111-1111-1111-111111111111', posicion: 1, es_yo: false, alias: 'Carla M.', iniciales: 'CM', country_code: 'DO', rank_key: 'oro', rank_division: 2, puntos_semana: 190, puntos_total: 3200, racha: 21 },
        { user_id: '22222222-2222-2222-2222-222222222222', posicion: 2, es_yo: false, alias: 'Atleta #8192', iniciales: 'AT', country_code: 'MX', rank_key: 'oro', rank_division: 1, puntos_semana: 140, puntos_total: 2400, racha: 12 },
        { user_id: '33333333-3333-3333-3333-333333333333', posicion: 3, es_yo: false, alias: 'Luis R.', iniciales: 'LR', country_code: 'DO', rank_key: 'plata', rank_division: 3, puntos_semana: 90, puntos_total: 1500, racha: 8 },
        { user_id: '44444444-4444-4444-4444-444444444444', posicion: 4, es_yo: true, alias: 'Angel T.', iniciales: 'AT', country_code: 'DO', rank_key: 'plata', rank_division: 2, puntos_semana: 70, puntos_total: 1120, racha: 6, zona: 'bono' },
    ],
    misiones: {
        completadas: 1,
        total: 3,
        bono_semana: 20,
        misiones: [
            { id: 'proteina_4d', progreso: 4, meta: 4, completada: true, puntos: 20 },
            { id: 'banda_3d', progreso: 2, meta: 3, completada: false, puntos: 20 },
            { id: 'agua_5d', progreso: 3, meta: 5, completada: false, puntos: 15 },
        ],
    },
    insignias: [
        { id: 'primera_chispa', categoria: 'racha', progreso: 3, meta: 3, desbloqueada: true },
        { id: 'maestro_bioboros', categoria: 'carrera', progreso: 0, meta: 1, desbloqueada: false },
    ],
};

describe('ClasificatoriaPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.assessment.isGuest = false;
        mocks.assessment.userProfile = { id: '11111111-1111-1111-1111-111111111111', health_profile: { country: 'DO' } };
        delete mocks.assessment.updateUserProfile;
        mocks.leerClasificatoriaGuardada.mockReturnValue(null);
        mocks.pedirClasificatoria.mockResolvedValue(DATOS_BASE);
        mocks.compararConRival.mockResolvedValue({
            tu: { ...DATOS_BASE.mi_perfil, iniciales: 'AT', mejor_racha: 10, semanas_perfectas: 1, insignias_total: 4 },
            rival: { alias: 'Carla M.', iniciales: 'CM', rank_key: 'oro', rank_division: 2, puntos_semana: 190, puntos_total: 3200, racha: 21, mejor_racha: 25, semanas_perfectas: 4, insignias_total: 9 },
        });
        mocks.guardarPerfilJuego.mockResolvedValue({ ok: true });
        mocks.compartirClasificatoria.mockResolvedValue('compartido');
    });

    it('renderiza podio, lista, misiones y vitrina de insignias', async () => {
        render(<MemoryRouter><ClasificatoriaPage /></MemoryRouter>);

        expect(await screen.findByText('Carla M.')).toBeInTheDocument();
        expect(screen.getByText('Atleta #8192')).toBeInTheDocument();
        expect(screen.getByText('+45 pts podio')).toBeInTheDocument();
        expect(screen.getAllByText('Angel T.').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Proteína firme')).toBeInTheDocument();
        expect(screen.getByText('Primera chispa')).toBeInTheDocument();
    });

    it('cambia pestañas y ámbito llamando al backend con los parámetros correctos', async () => {
        render(<MemoryRouter><ClasificatoriaPage /></MemoryRouter>);
        await screen.findByText('Carla M.');

        fireEvent.click(screen.getByRole('tab', { name: 'Rachas' }));
        await waitFor(() => expect(mocks.pedirClasificatoria).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ tab: 'rachas', scope: 'global' }),
        ));

        fireEvent.click(screen.getByRole('button', { name: /Mi país/i }));
        await waitFor(() => expect(mocks.pedirClasificatoria).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ tab: 'rachas', scope: 'pais' }),
        ));
    });

    it('abre el duelo Cara a Cara al tocar un rival y guarda identidad al editar Privacidad', async () => {
        render(<MemoryRouter><ClasificatoriaPage /></MemoryRouter>);
        await screen.findByText('Carla M.');

        fireEvent.click(screen.getByText('Carla M.').closest('button'));
        expect(await screen.findByRole('dialog', { name: 'Cara a cara' })).toBeInTheDocument();
        expect(mocks.compararConRival).toHaveBeenCalledWith(
            '11111111-1111-1111-1111-111111111111',
            '11111111-1111-1111-1111-111111111111',
        );
        fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[0]);

        fireEvent.click(screen.getByRole('button', { name: /Privacidad/i }));
        const dialog = await screen.findByRole('dialog', { name: 'Identidad y privacidad' });
        expect(dialog).toBeInTheDocument();

        const input = screen.getByLabelText('Alias en la clasificatoria');
        fireEvent.change(input, { target: { value: 'TitanRD' } });
        fireEvent.click(screen.getByRole('switch', { name: 'Modo incógnito' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        await waitFor(() => expect(mocks.guardarPerfilJuego).toHaveBeenCalledWith(
            '11111111-1111-1111-1111-111111111111',
            { display_alias: 'TitanRD', opt_in: false, limpiar_apodo: false },
        ));
    });

    it('permite guardar el nombre en línea cuando aparece como Jugador #', async () => {
        const updateUserProfile = vi.fn().mockResolvedValue({ success: true });
        mocks.assessment.updateUserProfile = updateUserProfile;
        mocks.assessment.userProfile = { id: '44444444-4444-4444-4444-444444444444', full_name: '', health_profile: { country: 'DO' } };
        mocks.pedirClasificatoria.mockResolvedValue({
            ...DATOS_BASE,
            mi_perfil: { ...DATOS_BASE.mi_perfil, alias: 'Jugador #990', display_alias: '', opt_in: true },
        });

        render(<MemoryRouter><ClasificatoriaPage /></MemoryRouter>);
        const input = await screen.findByLabelText('Tu nombre o apodo');
        fireEvent.change(input, { target: { value: 'Samuel P.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

        await waitFor(() => expect(updateUserProfile).toHaveBeenCalledWith({ full_name: 'Samuel P.' }));
    });

    it('pinta de inmediato desde la caché sin esperar la red', () => {
        mocks.leerClasificatoriaGuardada.mockReturnValue(DATOS_BASE);
        mocks.pedirClasificatoria.mockReturnValue(new Promise(() => {}));

        render(<MemoryRouter><ClasificatoriaPage /></MemoryRouter>);
        expect(screen.getByText('Carla M.')).toBeInTheDocument();
        expect(screen.queryByLabelText('Cargando clasificatoria')).not.toBeInTheDocument();
    });
});
