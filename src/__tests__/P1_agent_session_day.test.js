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
    diaLocalDe, sesionDeHoyEnServidor, sesionDelDiaAAdoptar,
    abrirSesionAutomatica, msHastaMedianoche, partesCuentaRegresiva, textoCuentaRegresiva,
    ultimoMensajeReal, debeRenovarse, diaDeActividad,
    SESSION_KEY, SESSION_DAY_KEY, SESSION_AUTO_KEY,
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

/* [P1-PLAN-LOTE-71 · 2026-09-16] El chat del día vive en el SERVIDOR. El logout
 * borra la clave local (P2-CHAT-CACHE-XUSER) y el dueño, al volver a entrar,
 * recibió un chat en blanco con el suyo de esa mañana en «Recientes · Hoy». */
const UUID_C = '33333333-4444-4555-8666-777777777777';
// Marca con el formato real del backend: `created_at::text` en una base en GMT.
const marca = (d) => d.toISOString().replace('T', ' ').replace('Z', '000+00');
const aLas = (h, m = 0, dia = 16) => new Date(2026, 8, dia, h, m, 0);
const sesion = (id, cuando, extra = {}) => ({
    id, title: 'Primer saludo', title_key: null, created_at: marca(cuando), last_activity: marca(cuando), ...extra,
});

describe('[P1-PLAN-LOTE-71] el chat de hoy se recupera del servidor', () => {
    beforeEach(() => { localStorage.clear(); });

    it('la sesión que abre la regla queda marcada; elegirla o usarla quita la marca', () => {
        resolverSesionDelDia({ hoy: '2026-09-16', nuevoId: UUID_A });
        expect(localStorage.getItem(SESSION_AUTO_KEY)).toBe(UUID_A);
        marcarActividad(UUID_A, '2026-09-16');
        expect(localStorage.getItem(SESSION_AUTO_KEY)).toBeNull();
    });

    it('volver el mismo día a la sesión automática conserva la marca', () => {
        // Ir a la Nevera y volver antes de que llegue la lista no puede perder la adopción.
        resolverSesionDelDia({ hoy: '2026-09-16', nuevoId: UUID_A });
        resolverSesionDelDia({ hoy: '2026-09-16', nuevoId: UUID_B });
        expect(localStorage.getItem(SESSION_AUTO_KEY)).toBe(UUID_A);
    });

    it('el caso del dueño: tras el logout, el chat de esa mañana se adopta', () => {
        resolverSesionDelDia({ hoy: '2026-09-16', nuevoId: UUID_A });
        marcarActividad(UUID_A, '2026-09-16');               // chateó por la mañana
        localStorage.removeItem(SESSION_KEY);                  // lo que hace el logout
        const { sessionId } = resolverSesionDelDia({ hoy: '2026-09-16', nuevoId: UUID_B });
        expect(sessionId).toBe(UUID_B);                        // la regla sola abre uno en blanco…
        const sesiones = [sesion(UUID_A, aLas(12, 58))];
        expect(sesionDelDiaAAdoptar({ sesiones, actual: UUID_B, hoy: '2026-09-16' })).toBe(UUID_A);
    });

    it('un «Nuevo chat» elegido a mano no se cambia', () => {
        marcarActividad(UUID_C, '2026-09-16');
        const sesiones = [sesion(UUID_A, aLas(12, 58))];
        expect(sesionDelDiaAAdoptar({ sesiones, actual: UUID_C, hoy: '2026-09-16' })).toBeNull();
    });

    it('si la sesión abierta ya tiene mensajes en el servidor, se queda', () => {
        resolverSesionDelDia({ hoy: '2026-09-16', nuevoId: UUID_B });
        const sesiones = [sesion(UUID_A, aLas(12, 58)), sesion(UUID_B, aLas(9, 0))];
        expect(sesionDelDiaAAdoptar({ sesiones, actual: UUID_B, hoy: '2026-09-16' })).toBeNull();
    });

    it('sin chat de hoy (o solo uno vacío) no hay nada que adoptar', () => {
        resolverSesionDelDia({ hoy: '2026-09-16', nuevoId: UUID_B });
        const ayer = [sesion(UUID_A, aLas(23, 50, 15))];
        expect(sesionDelDiaAAdoptar({ sesiones: ayer, actual: UUID_B, hoy: '2026-09-16' })).toBeNull();
        const vacio = [sesion(UUID_A, aLas(12, 0), { title: null, title_key: 'empty' })];
        expect(sesionDelDiaAAdoptar({ sesiones: vacio, actual: UUID_B, hoy: '2026-09-16' })).toBeNull();
        expect(sesionDelDiaAAdoptar({ sesiones: undefined, actual: UUID_B, hoy: '2026-09-16' })).toBeNull();
    });

    it('de varios chats de hoy gana el de actividad más reciente, sin fiarse del orden', () => {
        const sesiones = [
            sesion(UUID_A, aLas(8, 26)),
            sesion(UUID_C, aLas(16, 5), { title: null, title_key: 'image_or_system' }),
            sesion(UUID_B, aLas(12, 58)),
        ];
        expect(sesionDeHoyEnServidor(sesiones, '2026-09-16')).toBe(UUID_C);
    });

    it('el día de la marca es LOCAL: las 22:30 en RD son 02:30 UTC del día siguiente', () => {
        const nocheLocal = aLas(22, 30);
        expect(diaLocalDe(marca(nocheLocal))).toBe('2026-09-16');
        expect(diaLocalDe(nocheLocal.toISOString())).toBe('2026-09-16');
        expect(diaLocalDe('no-es-fecha')).toBeNull();
        expect(diaLocalDe(null)).toBeNull();
    });
});

/* [P1-PLAN-LOTE-73 · 2026-09-16] El chat del día se renueva solo también con la
 * pestaña abierta, sin cortar nada en curso, y la cuenta regresiva lo anuncia. */
const msg = (cuando, extra = {}) => ({ role: 'user', content: 'x', created_at: cuando.toISOString(), ...extra });

describe('[P1-PLAN-LOTE-73] renovación diaria y cuenta regresiva', () => {
    beforeEach(() => { localStorage.clear(); });

    it('abrirSesionAutomatica deja sesión, día y marca automática', () => {
        expect(abrirSesionAutomatica({ hoy: '2026-09-17', nuevoId: UUID_C })).toBe(UUID_C);
        expect(localStorage.getItem(SESSION_KEY)).toBe(UUID_C);
        expect(localStorage.getItem(SESSION_DAY_KEY)).toBe('2026-09-17');
        expect(localStorage.getItem(SESSION_AUTO_KEY)).toBe(UUID_C);
    });

    it('la cuenta regresiva va a la medianoche local, en horas y minutos hacia abajo', () => {
        const ms = msHastaMedianoche(new Date(2026, 8, 16, 17, 38, 30));
        expect(partesCuentaRegresiva(ms)).toEqual({ h: 6, m: 21, menosDeUnMinuto: false });
        const t = (k, v) => (v ? k.replace(/\{(\w+)\}/g, (_, n) => String(v[n])) : k);
        expect(textoCuentaRegresiva(ms, t)).toBe('Nuevo chat automático en 6 h 21 min');
        expect(textoCuentaRegresiva(msHastaMedianoche(new Date(2026, 8, 16, 23, 10, 0)), t)).toBe('Nuevo chat automático en 50 min');
        expect(textoCuentaRegresiva(msHastaMedianoche(new Date(2026, 8, 16, 23, 59, 40)), t))
            .toBe('Nuevo chat automático en menos de un minuto');
    });

    it('el último mensaje real ignora el saludo, las burbujas de error y lo que no tiene fecha', () => {
        const a = new Date(2026, 8, 16, 22, 0);
        const lista = [
            { role: 'model', content: 'hola', isWelcome: true, created_at: new Date(2026, 8, 17, 9, 0).toISOString() },
            msg(a),
            { role: 'model', content: 'error', _isErrorBubble: true, created_at: new Date(2026, 8, 17, 9, 0).toISOString() },
            { role: 'model', content: 'sin fecha' },
        ];
        expect(ultimoMensajeReal(lista)).toBe(a.getTime());
        expect(ultimoMensajeReal([{ role: 'model', content: 'hola', isWelcome: true }])).toBeNull();
    });

    it('se renueva solo si la conversación es de ayer y su último mensaje tiene 15 minutos o más', () => {
        marcarActividad(UUID_A, '2026-09-16');
        const ahora = new Date(2026, 8, 17, 0, 30);
        const r = (messages, extra = {}) => debeRenovarse({ messages, sessionId: UUID_A, ahora, ...extra });
        expect(r([msg(new Date(2026, 8, 16, 23, 40))])).toBe(true);
        expect(r([msg(new Date(2026, 8, 17, 0, 20))])).toBe(false);                                       // de hoy
        expect(r([msg(new Date(2026, 8, 16, 23, 59))], { ahora: new Date(2026, 8, 17, 0, 5) })).toBe(false);
        expect(r([])).toBe(false);                                                                         // ya es nuevo
        expect(r([{ role: 'model', content: 'hola', isWelcome: true }])).toBe(false);
    });

    it('no se renueva una sesión usada o elegida hoy, ni una que no es la guardada', () => {
        const viejos = [msg(new Date(2026, 8, 2, 12, 0))];
        const ahora = new Date(2026, 8, 17, 10, 0);
        marcarActividad(UUID_A, '2026-09-17');                         // abierta a mano hoy
        expect(debeRenovarse({ messages: viejos, sessionId: UUID_A, ahora })).toBe(false);
        marcarActividad(UUID_A, '2026-09-16');
        expect(debeRenovarse({ messages: viejos, sessionId: UUID_B, ahora })).toBe(false);   // no es la guardada
        expect(debeRenovarse({ messages: viejos, sessionId: UUID_A, ahora })).toBe(true);
    });

    it('hidratar pasada la medianoche no convierte el chat de ayer en el de hoy', () => {
        localStorage.setItem(SESSION_KEY, UUID_A);
        localStorage.setItem(SESSION_DAY_KEY, '2026-09-16');
        const ayer = [msg(new Date(2026, 8, 16, 23, 40))];
        expect(diaDeActividad(ayer, UUID_A, '2026-09-17')).toBe('2026-09-16');
        // Un mensaje de hoy, sí.
        expect(diaDeActividad([...ayer, msg(new Date(2026, 8, 17, 0, 10))], UUID_A, '2026-09-17')).toBe('2026-09-17');
        // Sin fechas (caché vieja): la conducta de antes, hoy.
        expect(diaDeActividad([{ role: 'user', content: 'x' }], UUID_A, '2026-09-17')).toBe('2026-09-17');
    });

    it('el día anotado no retrocede: elegir a mano un chat viejo lo hace el de hoy', () => {
        marcarActividad(UUID_B, '2026-09-17');
        expect(diaDeActividad([msg(new Date(2026, 8, 2, 12, 0))], UUID_B, '2026-09-17')).toBe('2026-09-17');
    });
});
