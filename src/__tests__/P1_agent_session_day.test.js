/* [P1-AGENT-SESSION-DAY · 2026-08-14] El Agente abre chat nuevo cada día, y
 * conserva el hilo dentro del mismo día.
 *
 * El owner pidió «que cada vez que me redirija al Agente me envíe a un nuevo
 * chat» — porque al entrar le salía una conversación del 1 de agosto, de trece
 * días antes. Pero «siempre nuevo» habría reintroducido, tal cual, el problema
 * que él mismo reportó el 20 de mayo: perder la conversación EN CURSO al ir a
 * la Nevera y volver («se refresca y molesta», P1-AGENT-PERSIST-SESSION).
 *
 * No son peticiones opuestas: la persistencia era ABSOLUTA, sin caducidad, así
 * que acertaba a los treinta segundos y fallaba a los trece días. Lo que
 * faltaba era la frontera, y el día es la que corresponde a esta app (plan
 * diario, diario de comidas, «te quedan 1280 kcal de hoy»).
 *
 * Estos casos son los dos deseos a la vez, y por eso el guard mide AMBOS.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    resolverSesionDelDia, marcarActividad, hoyLocal,
    SESSION_KEY, SESSION_DAY_KEY,
} from '../utils/chatSessionDay';

const UUID_A = '11111111-2222-4333-8444-555555555555';
const UUID_B = '99999999-8888-4777-8666-555555555555';

describe('[P1-AGENT-SESSION-DAY] la sesión del chat caduca con el día', () => {
    beforeEach(() => { localStorage.clear(); });

    it('sin nada guardado abre una sesión nueva', () => {
        const { sessionId, esNueva } = resolverSesionDelDia({ hoy: '2026-08-14', nuevoId: UUID_A });
        expect(esNueva).toBe(true);
        expect(sessionId).toBe(UUID_A);
        expect(localStorage.getItem(SESSION_DAY_KEY)).toContain('2026-08-14');
    });

    it('DENTRO del mismo día conserva el hilo — el caso de mayo', () => {
        // Ir a la Nevera y volver no puede costarte la conversación abierta.
        resolverSesionDelDia({ hoy: '2026-08-14', nuevoId: UUID_A });
        const vuelta = resolverSesionDelDia({ hoy: '2026-08-14', nuevoId: UUID_B });
        expect(vuelta.esNueva, 'volver el mismo día NO debe abrir chat nuevo').toBe(false);
        expect(vuelta.sessionId).toBe(UUID_A);
    });

    it('OTRO día abre chat nuevo — el caso de hoy', () => {
        resolverSesionDelDia({ hoy: '2026-08-01', nuevoId: UUID_A });
        const manana = resolverSesionDelDia({ hoy: '2026-08-14', nuevoId: UUID_B });
        expect(manana.esNueva, 'una conversación de otro día no debe resucitar').toBe(true);
        expect(manana.sessionId).toBe(UUID_B);
    });

    it('una sesión guardada SIN marca de día se trata como vencida', () => {
        // El estado de todos los usuarios en el momento del despliegue: tienen
        // sesión pero no marca. Deben empezar con chat nuevo, que es lo pedido.
        localStorage.setItem(SESSION_KEY, JSON.stringify(UUID_A));
        const r = resolverSesionDelDia({ hoy: '2026-08-14', nuevoId: UUID_B });
        expect(r.esNueva).toBe(true);
        expect(r.sessionId).toBe(UUID_B);
    });

    it('un id corrupto no se reutiliza', () => {
        localStorage.setItem(SESSION_KEY, JSON.stringify('no-soy-un-uuid'));
        localStorage.setItem(SESSION_DAY_KEY, JSON.stringify('2026-08-14'));
        expect(resolverSesionDelDia({ hoy: '2026-08-14', nuevoId: UUID_B }).esNueva).toBe(true);
    });

    it('la actividad renueva el día: chatear a medianoche no te expulsa al volver', () => {
        resolverSesionDelDia({ hoy: '2026-08-13', nuevoId: UUID_A });
        marcarActividad(UUID_A, '2026-08-14');   // sigues escribiendo pasada la medianoche
        const vuelta = resolverSesionDelDia({ hoy: '2026-08-14', nuevoId: UUID_B });
        expect(vuelta.esNueva, 'la sesión con actividad de HOY sigue siendo la de hoy').toBe(false);
        expect(vuelta.sessionId).toBe(UUID_A);
    });

    it('marcarActividad ignora ids inválidos (no ensucia la clave)', () => {
        marcarActividad('basura', '2026-08-14');
        expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });
});

describe('[P1-AGENT-SESSION-DAY] el día es LOCAL, no UTC', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('las 22:00 en RD (UTC-4) siguen siendo el mismo día', () => {
        // En UTC ya serían las 02:00 del día siguiente: con un corte en UTC, el
        // chat se cortaría a media cena. Se comprueba con la fecha del sistema,
        // que en este entorno corre en hora local.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 7, 14, 22, 0, 0)); // 14-ago 22:00 local
        expect(hoyLocal()).toBe('2026-08-14');
    });

    it('formatea con ceros a la izquierda', () => {
        expect(hoyLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
});
