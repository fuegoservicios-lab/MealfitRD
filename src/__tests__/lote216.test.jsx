// [P1-PLAN-LOTE-216 · 2026-09-24] Cada recordatorio de comida, con su interruptor y su hora.
//
// El dueño, con el aviso del desayuno todavía en el chat a la 1:18 p. m.: «¿y qué tal si el usuario lo puede decidir?
// … no sería más flexible?». Su almuerzo sonaba hacia las 2:15 porque la hora salía de cuándo REGISTRABA (siempre
// después de comer). Ahora se elige en Configuración; sin tocar nada, las normales (8:45 / 12:45 / 15:45 / 19:15).
//
// Se prueba el COMPORTAMIENTO del panel (qué se pinta y qué viaja en el PATCH), no solo el texto del fuente.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import RecordatoriosPorComida from '../components/settings/RecordatoriosPorComida';
import { CLAVE_AVISOS_POR_COMIDA, aHHMM, configParaGuardar, leerHHMM } from '../utils/recordatoriosPorComida';
import { buildHealthProfilePayload, CLAVES_CON_CONTROL_PROPIO } from '../config/secureFormStorage';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

// Lo que manda `GET /api/notifications/meal-reminders` → `comidas` (meal_reminders.comidas_para_configuracion).
const fila = (meal, hour, minute, extra = {}) => ({
    meal, active: true, hour, minute, chosen: false, default_hour: hour, default_minute: minute, ...extra,
});
const COMIDAS_NORMALES = [
    fila('desayuno', 8, 45), fila('almuerzo', 12, 45), fila('merienda', 15, 45), fila('cena', 19, 15),
];
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

let comidasDelServidor;
const patches = () => fetchWithAuth.mock.calls
    .filter(([url, o]) => url === '/api/profile' && o?.method === 'PATCH')
    .map(([, o]) => JSON.parse(o.body));
const gets = () => fetchWithAuth.mock.calls.filter(([url]) => url === '/api/notifications/meal-reminders');

const montar = async (props = {}) => {
    const onGuardado = props.onGuardado ?? vi.fn();
    render(<RecordatoriosPorComida claseInterruptor="sw" claseDeslizador="sl" onGuardado={onGuardado} {...props} />);
    await screen.findByRole('group', { name: 'Hora de cada recordatorio' });
    return onGuardado;
};
const hora = (nombre) => screen.getByLabelText(`Hora del recordatorio: ${nombre}`);
const interruptor = (nombre) => screen.getByLabelText(`Recordatorio: ${nombre}`);

describe('lote 216 · el panel pinta lo que dice el servidor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        comidasDelServidor = COMIDAS_NORMALES;
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === '/api/notifications/meal-reminders') {
                return respuesta({ enabled: true, quiet_until_hour: 6, reminders_before_hour: 23, reminders: [], comidas: comidasDelServidor });
            }
            return respuesta({ success: true });
        });
    });

    it('las cuatro comidas con su hora, y la apagada con la hora deshabilitada', async () => {
        comidasDelServidor = [...COMIDAS_NORMALES.slice(0, 3), fila('cena', 19, 15, { active: false })];
        await montar();
        expect(hora('Desayuno').value).toBe('08:45');
        expect(hora('Almuerzo').value).toBe('12:45');
        expect(hora('Merienda').value).toBe('15:45');
        expect(hora('Cena').value).toBe('19:15');
        expect(interruptor('Cena').checked).toBe(false);
        expect(hora('Cena').disabled).toBe(true);
        expect(interruptor('Desayuno').checked).toBe(true);
        expect(hora('Desayuno').disabled).toBe(false);
        // antes de las 6 no suena nada, y desde las 23 solo llega el resumen del día: el selector no lo ofrece
        expect(hora('Desayuno').getAttribute('min')).toBe('06:00');
        expect(hora('Desayuno').getAttribute('max')).toBe('22:59');
        // sin horas elegidas no hay nada que restablecer
        expect(screen.queryByRole('button', { name: 'Volver a las horas normales' })).toBeNull();
    });

    it('un servidor anterior al lote (sin `comidas`) no pinta nada: el interruptor general sigue arriba', async () => {
        fetchWithAuth.mockImplementation(async () => respuesta({ enabled: true, reminders: [] }));
        const { container } = render(<RecordatoriosPorComida claseInterruptor="sw" claseDeslizador="sl" />);
        await waitFor(() => expect(gets().length).toBe(1));
        await act(async () => {});
        expect(container.innerHTML).toBe('');
    });

    it('si no carga, lo dice y deja reintentar (no pinta horas inventadas)', async () => {
        fetchWithAuth.mockImplementationOnce(async () => respuesta({ detail: 'boom' }, false, 500));
        render(<RecordatoriosPorComida claseInterruptor="sw" claseDeslizador="sl" />);
        expect(await screen.findByText('No pudimos cargar tus horas de aviso.')).toBeTruthy();
        expect(screen.queryByLabelText('Hora del recordatorio: Desayuno')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
        expect((await screen.findByLabelText('Hora del recordatorio: Desayuno')).value).toBe('08:45');
        expect(gets().length).toBe(2);
    });
});

describe('lote 216 · lo que se guarda', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        comidasDelServidor = COMIDAS_NORMALES;
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === '/api/notifications/meal-reminders') {
                return respuesta({ enabled: true, quiet_until_hour: 6, reminders_before_hour: 23, reminders: [], comidas: comidasDelServidor });
            }
            return respuesta({ success: true });
        });
    });

    it('apagar una comida manda las CUATRO (el merge del perfil es de primer nivel) y reprograma el teléfono', async () => {
        const onGuardado = await montar();
        fireEvent.click(interruptor('Merienda'));
        await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1));
        expect(patches()).toEqual([{
            health_profile: {
                avisos_por_comida: {
                    desayuno: { activo: true, hora: null },
                    almuerzo: { activo: true, hora: null },
                    merienda: { activo: false, hora: null },
                    cena: { activo: true, hora: null },
                },
            },
        }]);
        expect(interruptor('Merienda').checked).toBe(false);
        expect(hora('Merienda').disabled).toBe(true);
        expect(toast.success).toHaveBeenCalledWith('Recordatorios guardados.', { id: 'recordatorios-comida' });
    });

    it('elegir una hora la guarda al soltar el campo; las otras siguen en la normal (`hora: null`)', async () => {
        const onGuardado = await montar();
        fireEvent.change(hora('Almuerzo'), { target: { value: '12:00' } });
        expect(patches()).toEqual([]);            // mientras se edita no viaja nada
        fireEvent.blur(hora('Almuerzo'));
        await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1));
        expect(patches()[0].health_profile.avisos_por_comida).toEqual({
            desayuno: { activo: true, hora: null },
            almuerzo: { activo: true, hora: '12:00' },
            merienda: { activo: true, hora: null },
            cena: { activo: true, hora: null },
        });
        expect(hora('Almuerzo').value).toBe('12:00');
        // ya hay una hora propia: aparece la vuelta a las normales
        expect(screen.getByRole('button', { name: 'Volver a las horas normales' })).toBeTruthy();
    });

    it('soltar el campo sin cambiar la hora (o vacío) no guarda nada', async () => {
        await montar();
        fireEvent.change(hora('Cena'), { target: { value: '19:15' } });
        fireEvent.blur(hora('Cena'));
        fireEvent.change(hora('Desayuno'), { target: { value: '' } });
        fireEvent.blur(hora('Desayuno'));
        await act(async () => {});
        expect(patches()).toEqual([]);
        expect(hora('Desayuno').value).toBe('08:45');   // el borrador vacío se descarta: vuelve la guardada
    });

    it('solo deja horas en las que suenan el teléfono Y el chat: ni de madrugada ni desde las 23:00', async () => {
        // A las 23:10 el coach solo manda el resumen del día: el teléfono sonaría sin mensaje en el chat, justo lo que
        // vio el dueño con el desayuno. El servidor las rechaza con un 400; aquí se dice antes y no viaja nada.
        await montar();
        fireEvent.change(hora('Desayuno'), { target: { value: '05:30' } });
        fireEvent.blur(hora('Desayuno'));
        fireEvent.change(hora('Cena'), { target: { value: '23:10' } });
        fireEvent.blur(hora('Cena'));
        await act(async () => {});
        expect(patches()).toEqual([]);
        expect(toast.error).toHaveBeenCalledTimes(2);
        expect(toast.error).toHaveBeenLastCalledWith('Elige una hora entre las 6:00 y las 22:59.', { id: 'recordatorios-comida' });
        expect(hora('Desayuno').value).toBe('08:45');
        expect(hora('Cena').value).toBe('19:15');
        // el borde de dentro sí vale
        fireEvent.change(hora('Cena'), { target: { value: '22:55' } });
        fireEvent.blur(hora('Cena'));
        await waitFor(() => expect(patches().length).toBe(1));
        expect(patches()[0].health_profile.avisos_por_comida.cena).toEqual({ activo: true, hora: '22:55' });
    });

    it('los límites los dice el servidor (sin una segunda copia en la app)', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === '/api/notifications/meal-reminders') {
                return respuesta({ enabled: true, quiet_until_hour: 7, reminders_before_hour: 22, reminders: [], comidas: COMIDAS_NORMALES });
            }
            return respuesta({ success: true });
        });
        await montar();
        expect(hora('Cena').getAttribute('min')).toBe('07:00');
        expect(hora('Cena').getAttribute('max')).toBe('21:59');
        fireEvent.change(hora('Cena'), { target: { value: '21:30' } });
        fireEvent.blur(hora('Cena'));
        fireEvent.change(hora('Desayuno'), { target: { value: '06:30' } });
        fireEvent.blur(hora('Desayuno'));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
            'Elige una hora entre las 7:00 y las 21:59.', { id: 'recordatorios-comida' },
        ));
        await waitFor(() => expect(patches().length).toBe(1));
        expect(patches()[0].health_profile.avisos_por_comida.cena.hora).toBe('21:30');
        expect(patches()[0].health_profile.avisos_por_comida.desayuno.hora).toBeNull();
    });

    it('«Volver a las horas normales» pone las de siempre y manda `hora: null` en las cuatro', async () => {
        comidasDelServidor = [
            fila('desayuno', 7, 30, { chosen: true, default_hour: 8, default_minute: 45 }),
            fila('almuerzo', 12, 45), fila('merienda', 15, 45),
            fila('cena', 21, 0, { chosen: true, active: false, default_hour: 19, default_minute: 15 }),
        ];
        const onGuardado = await montar();
        expect(hora('Desayuno').value).toBe('07:30');
        fireEvent.click(screen.getByRole('button', { name: 'Volver a las horas normales' }));
        await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1));
        expect(patches()[0].health_profile.avisos_por_comida).toEqual({
            desayuno: { activo: true, hora: null },
            almuerzo: { activo: true, hora: null },
            merienda: { activo: true, hora: null },
            cena: { activo: false, hora: null },   // restablecer las horas no enciende lo que apagaste
        });
        expect(hora('Desayuno').value).toBe('08:45');
        expect(hora('Cena').value).toBe('19:15');
        expect(screen.queryByRole('button', { name: 'Volver a las horas normales' })).toBeNull();
    });

    it('dos cambios seguidos no se pisan: el segundo espera y viaja con los dos', async () => {
        let soltarPrimero;
        const onGuardado = await montar();
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === '/api/profile' && !soltarPrimero) {
                return new Promise((r) => { soltarPrimero = () => r(respuesta({ success: true })); });
            }
            return respuesta({ success: true });
        });
        fireEvent.click(interruptor('Desayuno'));
        fireEvent.click(interruptor('Cena'));
        expect(patches().length).toBe(1);          // uno en vuelo, el otro esperando
        await act(async () => { soltarPrimero(); });
        await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1));
        const [primero, segundo] = patches().map((b) => b.health_profile.avisos_por_comida);
        expect(primero.desayuno.activo).toBe(false);
        expect(primero.cena.activo).toBe(true);
        expect(segundo.desayuno.activo).toBe(false);   // el segundo no deshace el primero
        expect(segundo.cena.activo).toBe(false);
        expect(patches().length).toBe(2);
    });

    it('si el guardado falla lo dice, no reprograma y vuelve a pintar lo que de verdad quedó', async () => {
        const onGuardado = await montar();
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === '/api/profile') return respuesta({ detail: 'boom' }, false, 500);
            return respuesta({ enabled: true, quiet_until_hour: 6, reminders_before_hour: 23, reminders: [], comidas: COMIDAS_NORMALES });
        });
        fireEvent.click(interruptor('Almuerzo'));
        expect(interruptor('Almuerzo').checked).toBe(false);   // optimista…
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
            'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.', { id: 'recordatorios-comida' },
        ));
        await waitFor(() => expect(interruptor('Almuerzo').checked).toBe(true));   // …y vuelve a lo guardado
        expect(gets().length).toBe(2);
        expect(onGuardado).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('un 429 del perfil (10 por minuto) no se anuncia como un fallo de conexión', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === '/api/profile') return respuesta({ detail: 'Too Many Requests' }, false, 429);
            return respuesta({ enabled: true, quiet_until_hour: 6, reminders_before_hour: 23, reminders: [], comidas: COMIDAS_NORMALES });
        });
        await montar();
        fireEvent.click(interruptor('Cena'));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
            'Demasiadas solicitudes seguidas. Espera un momento y reintenta.', { id: 'recordatorios-comida' },
        ));
        await waitFor(() => expect(interruptor('Cena').checked).toBe(true));   // vuelve a lo guardado
    });
});

describe('lote 216 · lo puro', () => {
    it('configParaGuardar: la hora solo viaja si la persona la eligió', () => {
        expect(configParaGuardar([
            fila('desayuno', 7, 5, { chosen: true }),
            fila('cena', 19, 15, { active: false }),
            { hour: 1 },   // sin `meal` no se guarda basura
        ])).toEqual({ desayuno: { activo: true, hora: '07:05' }, cena: { activo: false, hora: null } });
        expect(configParaGuardar(null)).toEqual({});
    });

    it('leerHHMM: solo horas completas y válidas', () => {
        expect(leerHHMM('12:30')).toEqual({ hora: 12, minuto: 30 });
        expect(leerHHMM('00:00')).toEqual({ hora: 0, minuto: 0 });
        for (const malo of ['', null, undefined, '7:30', '12:3', '24:00', '12:60', 'hola']) {
            expect(leerHHMM(malo), String(malo)).toBeNull();
        }
        expect(aHHMM(8, 5)).toBe('08:05');
    });

    it('la clave es la que valida el servidor y el formulario no la manda (su dueño es este panel)', () => {
        expect(CLAVE_AVISOS_POR_COMIDA).toBe('avisos_por_comida');
        expect(CLAVES_CON_CONTROL_PROPIO).toContain('avisos_por_comida');
        const congelado = { desayuno: { activo: false, hora: '07:00' } };
        const p = buildHealthProfilePayload({ weight: 70, avisos_por_comida: congelado }, {}, null);
        expect(p).not.toHaveProperty('avisos_por_comida');
        expect(p.weight).toBe(70);
    });
});

describe('lote 216 · Configuración lo pinta donde toca', () => {
    const S = leer('src/pages/Settings.jsx');

    it('solo con los recordatorios de comida encendidos, y al guardar el teléfono reprograma', () => {
        expect(S).toContain("import RecordatoriosPorComida from '../components/settings/RecordatoriosPorComida';");
        expect(S).toContain("{clave === 'avisos_comida' && valor && (");
        const i = S.indexOf('<RecordatoriosPorComida');
        expect(S.slice(i, i + 300)).toContain('onGuardado={sincronizarAvisosLocales}');
    });

    it('el subtítulo ya no promete «tu hora habitual»', () => {
        expect(S).toContain("t('Un aviso por comida, a la hora que elijas.')");
        expect(S).not.toContain('justo antes de tu hora habitual');
    });

    it('los textos nuevos están en los cuatro catálogos', () => {
        const nuevos = ['Un aviso por comida, a la hora que elijas.', 'Recordatorios guardados.',
            'Elige una hora entre las {desde} y las {hasta}.', 'No pudimos cargar tus horas de aviso.',
            'Hora de cada recordatorio', 'Hora del recordatorio: {comida}', 'Recordatorio: {comida}',
            'Volver a las horas normales'];
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(leer(`src/i18n/locales/${loc}.json`));
            for (const k of nuevos) expect(cat[k], `${loc}: falta «${k}»`).toBeTruthy();
            for (const vieja of ['Un aviso por comida, justo antes de tu hora habitual.', 'Elige una hora a partir de las {hora}.']) {
                expect(cat[vieja], `${loc}: huérfana «${vieja}»`).toBeUndefined();
            }
        }
    });
});
