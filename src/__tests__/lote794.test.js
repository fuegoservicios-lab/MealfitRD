/**
 * [P1-PLAN-LOTE-794 · 2026-09-28] (G28) PostHog sin cookies y sin banner — comprobado con el SDK REAL.
 *
 * La decisión del dueño: en España la analítica con cookie exige consentimiento previo (banner); la
 * alternativa elegida es que PostHog no deje NADA en el dispositivo (`cookieless_mode: 'always'`,
 * posthog-js ≥ 1.2xx): ni cookie, ni `localStorage`, ni `sessionStorage`. La identidad del visitante
 * la calcula PostHog en su servidor.
 *
 * Por qué con el SDK real y no con un mock de `posthog.init`: un mock sólo prueba que pasamos una
 * opción, no que la opción haga lo que creemos. Leyendo posthog-js 1.399.2 salieron tres cosas que
 * un mock no habría visto nunca:
 *   1. `opt_out_capturing()` y `opt_in_capturing()` son NO-OP en modo `always` (avisan y salen). El
 *      interruptor de Configuración quedaba muerto: por eso el corte vive ahora en `before_send`.
 *   2. Sin persistencia, la identidad no sobrevive a la recarga: `identify()` hay que repetirlo en
 *      CADA carga, y a menudo llega ANTES de que el SDK (import diferido en idle) exista.
 *   3. La persistencia deshabilitada BORRA la entrada de su propio almacén al arrancar: con
 *      `persistence: 'localStorage+cookie'` se limpian la cookie y el `localStorage` que los
 *      visitantes arrastran de antes de este cambio.
 *
 * La red está cortada (fetch y XHR sustituidos): el SDK no sale de este proceso.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = 'phc_test_lote794';
const NOMBRE_PERSISTENCIA = `ph_${TOKEN}_posthog`;
// [P1-PLAN-LOTE-794 · ronda 1] La clave de consentimiento que escribía el `opt_in_capturing()` de antes
// (encender el interruptor de Configuración). Vive FUERA de la persistencia: `disable_persistence` no la toca.
const CLAVE_CONSENTIMIENTO = `__ph_opt_in_out_${TOKEN}`;

// [P1-PLAN-LOTE-794 · ronda 1] Todo lo que el SDK intenta mandar (fetch y XHR), para poder buscar un id.
const peticiones = [];
const legible = (cuerpo) => {
    if (typeof cuerpo !== 'string') return '';
    // /flags y /e van como `data=<base64>` (Compression.Base64): se decodifica para poder leerlos.
    if (cuerpo.startsWith('data=')) {
        try { return atob(decodeURIComponent(cuerpo.slice(5))); } catch { /* sigue crudo */ }
    }
    return cuerpo;
};
const peticionesQueNombran = (id) => peticiones
    .filter((p) => `${p.url} ${legible(p.cuerpo)}`.includes(id))
    .map((p) => p.url);

const rastrosDePostHog = () => {
    const esDePostHog = (k) => /(^|_)ph_|posthog/i.test(k);
    const cookies = document.cookie
        .split(';')
        .map((c) => c.trim().split('=')[0])
        .filter(Boolean)
        .filter(esDePostHog);
    const local = Object.keys(localStorage).filter(esDePostHog);
    const sesion = Object.keys(sessionStorage).filter(esDePostHog);
    return [...cookies, ...local, ...sesion];
};

describe('P1-PLAN-LOTE-794 · PostHog sin cookies ni almacenamiento (SDK real)', () => {
    let cliente;
    let analytics;
    let capturados;

    beforeAll(async () => {
        localStorage.clear();
        sessionStorage.clear();
        // Red cortada: nada sale del proceso de test.
        vi.stubGlobal('fetch', vi.fn(async (url, opciones) => {
            peticiones.push({ url: String(url), cuerpo: opciones?.body });
            return {
                ok: true, status: 200, headers: new Map(),
                json: async () => ({}), text: async () => '{}',
            };
        }));
        vi.stubGlobal('XMLHttpRequest', class {
            open(_metodo, url) { this._url = url; }
            send(cuerpo) { peticiones.push({ url: String(this._url), cuerpo }); }
            setRequestHeader() {} abort() {}
        });
        vi.stubEnv('VITE_POSTHOG_KEY', TOKEN);

        // Un visitante que ya traía el identificador de la configuración vieja.
        document.cookie = `${NOMBRE_PERSISTENCIA}=%7B%22distinct_id%22%3A%22viejo%22%7D; path=/`;
        localStorage.setItem(NOMBRE_PERSISTENCIA, '{"distinct_id":"viejo"}');
        // …y la clave de consentimiento de quien alguna vez ENCENDIÓ el interruptor (opt_in_capturing).
        document.cookie = `${CLAVE_CONSENTIMIENTO}=1; path=/`;
        localStorage.setItem(CLAVE_CONSENTIMIENTO, '1');

        vi.resetModules();
        analytics = await import('../utils/analytics');
        cliente = await import('../utils/posthogClient');

        // La sesión se conoce ANTES de que el SDK exista (import diferido en idle).
        expect(window.posthog).toBeUndefined();
        cliente.identifyPostHog('usuario-794');

        await cliente.initPostHog();
        capturados = [];
        window.posthog.on('eventCaptured', (ev) => capturados.push(ev.event));
    });

    afterAll(() => {
        document.cookie = 'mf_analytics_opt_out=1; Max-Age=0; path=/';
        localStorage.clear();
        sessionStorage.clear();
        delete window.posthog;
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('arranca en modo sin cookies, sin persistencia', () => {
        expect(window.posthog.config.cookieless_mode).toBe('always');
        expect(window.posthog.config.disable_persistence).toBe(true);
        expect(window.posthog.persistence.isDisabled()).toBe(true);
    });

    it('borra la cookie y el localStorage que el visitante traía de antes', () => {
        expect(document.cookie).not.toContain(NOMBRE_PERSISTENCIA);
        expect(localStorage.getItem(NOMBRE_PERSISTENCIA)).toBeNull();
    });

    // [P1-PLAN-LOTE-794 · ronda 1] La persistencia deshabilitada no toca la clave de consentimiento: vive
    // en otro almacén del SDK. Sobrevivía al arranque y contradecía «sin guardar nada en su dispositivo».
    it('borra también la clave de consentimiento `__ph_opt_in_out_` que dejaba el opt_in_capturing de antes', () => {
        expect(localStorage.getItem(CLAVE_CONSENTIMIENTO)).toBeNull();
        expect(document.cookie).not.toContain(CLAVE_CONSENTIMIENTO);
        expect(rastrosDePostHog()).toEqual([]);
    });

    // [P1-PLAN-LOTE-794 · ronda 1] Conversaciones, como encuestas y tours, escribe su propio
    // `localStorage` si se enciende desde el panel, y su carga no se bloquea en modo `always`.
    it('las extensiones que escriben su propio almacenamiento quedan apagadas (encuestas, tours, conversaciones)', () => {
        expect(window.posthog.config.disable_surveys).toBe(true);
        expect(window.posthog.config.disable_product_tours).toBe(true);
        expect(window.posthog.config.disable_conversations).toBe(true);
    });

    it('la identidad pedida ANTES de cargar el SDK se aplica al cargarlo', () => {
        expect(window.posthog.get_distinct_id()).toBe('usuario-794');
    });

    it('capturar, identificar y resetear no deja cookie, localStorage ni sessionStorage de PostHog', () => {
        window.posthog.capture('$pageview');
        window.posthog.capture('evento_de_prueba', { a: 1 });
        analytics.trackEvent('evento_por_la_fachada', { b: 2 });
        cliente.identifyPostHog('usuario-794');
        cliente.resetPostHog();
        cliente.identifyPostHog('otro-usuario');
        expect(rastrosDePostHog()).toEqual([]);
        expect(capturados).toContain('evento_de_prueba');
        expect(capturados).toContain('evento_por_la_fachada');
    });

    it('logout: la identidad vuelve al centinela anónimo del modo sin cookies', () => {
        cliente.identifyPostHog('usuario-794');
        cliente.resetPostHog();
        expect(window.posthog.get_distinct_id()).toBe('$posthog_cookieless');
    });

    it('apagar la analítica en Configuración corta los eventos YA (opt_out_capturing es no-op aquí)', () => {
        capturados.length = 0;
        analytics.persistAnalyticsOptOut(true);
        window.posthog.capture('tras_apagar');       // p. ej. un $pageleave interno del SDK
        expect(capturados).not.toContain('tras_apagar');

        analytics.persistAnalyticsOptOut(false);
        window.posthog.capture('tras_encender');
        expect(capturados).toContain('tras_encender');
        expect(rastrosDePostHog()).toEqual([]);
    });

    // [P1-PLAN-LOTE-794 · ronda 1] (revisión, defecto 1) `before_send` sólo filtra EVENTOS. `identify()`
    // además recarga los flags: un POST a /flags con `distinct_id` y `person_properties` que no es un
    // evento y que nada cortaba. Apagar → cerrar sesión → entrar con otra cuenta (login por código, en
    // la misma carga) mandaba el id de la cuenta NUEVA a PostHog con la analítica apagada.
    it('apagada la analítica, otra sesión en la misma carga NO manda su id a PostHog (ni a /flags)', async () => {
        analytics.persistAnalyticsOptOut(true);
        cliente.resetPostHog();                         // cierre de sesión
        peticiones.length = 0;
        cliente.identifyPostHog('usuario-B-optout');    // otra cuenta, misma carga
        await new Promise((r) => setTimeout(r, 100));   // el SDK recarga los flags tras un debounce
        expect(peticionesQueNombran('usuario-B-optout')).toEqual([]);
        expect(window.posthog.get_distinct_id()).not.toBe('usuario-B-optout');
    });

    // …y el caso que el informe daba por aceptado: encender otra vez dejaba la sesión anónima hasta recargar.
    it('al volver a encender, la sesión de esta carga recupera su identidad sin recargar', () => {
        analytics.persistAnalyticsOptOut(false);
        cliente.reaplicarIdentidadPostHog();
        expect(window.posthog.get_distinct_id()).toBe('usuario-B-optout');
        expect(rastrosDePostHog()).toEqual([]);
    });

    // [P1-PLAN-LOTE-794 · ronda 2] (re-verificación, defecto 3) `/flags` no es un evento: `before_send` no lo
    // ve. Con la analítica apagada seguía saliendo por dos caminos, medidos con este mismo SDK:
    //   · apagar en caliente: `reset(true)` recarga los flags → POST /flags con `$posthog_cookieless`, la URL
    //     y el referrer (PostHog recibe además la IP y el navegador);
    //   · apagar desde OTRA pestaña: ésta no hace `reset`, conserva el `distinct_id` de la cuenta y el refresco
    //     de cada 5 min (`remote-config.js`, `refresh()` → `reloadFeatureFlags()`) lo sigue mandando.
    // La app no usa feature flags (su única llamada al SDK es `capture`): `advanced_disable_flags` corta /flags
    // de raíz, que es además por donde salía el id del defecto 1.
    const aFlags = () => peticiones.filter((p) => p.url.includes('/flags')).map((p) => p.url);

    it('arranca con /flags apagado: la app no usa feature flags', () => {
        expect(window.posthog.config.advanced_disable_flags).toBe(true);
    });

    // Sin remote config, el autocapture lo decide la config local (autocapture.js `isEnabled`): sigue vivo
    // dentro de la app, que es lo que la Política de Privacidad §7 declara («el texto visible» de lo que se pulsa).
    it('el autocapture sigue encendido sin remote config', () => {
        expect(window.posthog.autocapture.isEnabled).toBe(true);
    });

    it('apagada desde OTRA pestaña, el refresco periódico de flags no manda el id de la cuenta', async () => {
        analytics.persistAnalyticsOptOut(false);
        cliente.identifyPostHog('usuario-otra-pestana');
        await new Promise((r) => setTimeout(r, 100));
        // La otra pestaña sólo cambia la bandera compartida; ésta no se entera hasta el próximo evento.
        localStorage.setItem('mealfit_analytics_opt_out', '1');
        peticiones.length = 0;
        window.posthog.reloadFeatureFlags();            // lo que hace el refresco de cada 5 min
        await new Promise((r) => setTimeout(r, 100));
        expect(peticionesQueNombran('usuario-otra-pestana')).toEqual([]);
        expect(aFlags()).toEqual([]);
    });

    it('apagar en caliente (reset) no llama a /flags', async () => {
        analytics.persistAnalyticsOptOut(false);
        cliente.identifyPostHog('usuario-reset');
        await new Promise((r) => setTimeout(r, 100));
        peticiones.length = 0;
        analytics.persistAnalyticsOptOut(true);         // → reset(true)
        await new Promise((r) => setTimeout(r, 100));
        expect(aFlags()).toEqual([]);
        analytics.persistAnalyticsOptOut(false);
    });
});

describe('P1-PLAN-LOTE-794 · ronda 1 · Configuración reaplica la identidad al volver a encender', () => {
    const SETTINGS = fs.readFileSync(path.resolve(__dirname, '../pages/Settings.jsx'), 'utf8');
    const ini = SETTINGS.indexOf('const handleToggleAnalytics = () => {');
    const cuerpo = SETTINGS.slice(ini, SETTINGS.indexOf('\n    };', ini));

    it('handleToggleAnalytics llama a reaplicarIdentidadPostHog DESPUÉS de persistir el «sí»', () => {
        expect(ini).toBeGreaterThan(-1);
        const persistir = cuerpo.indexOf('persistAnalyticsOptOut(!next)');
        const reaplicar = cuerpo.indexOf('reaplicarIdentidadPostHog()');
        expect(persistir).toBeGreaterThan(-1);
        expect(reaplicar).toBeGreaterThan(persistir);
    });
});

describe('P1-PLAN-LOTE-794 · la identidad se declara en CADA carga con sesión', () => {
    // Sin persistencia, la identidad de ayer no llega a hoy. Antes sólo identificaba el callback de
    // `onAuthStateChange` («identify persiste», decía su comentario); la sesión inicial y la
    // reconstruida por cookie first-party entraban por `handleAuthChange` sin identificar.
    const SRC = fs.readFileSync(path.resolve(__dirname, '../context/AssessmentContext.jsx'), 'utf8');
    const ini = SRC.indexOf('const handleAuthChange = async (currentSession) => {');
    const cuerpo = SRC.slice(ini, SRC.indexOf('const _resolveViaFirstParty', ini));

    it('handleAuthChange —por donde pasan las tres entradas de sesión— identifica y resetea', () => {
        expect(ini).toBeGreaterThan(-1);
        expect(cuerpo).toMatch(/identifyPostHog\(currentSession\.user\.id\)/);
        expect(cuerpo).toMatch(/resetPostHog\(\)/);
    });

    it('un solo sitio: el callback de onAuthStateChange ya no lo duplica', () => {
        expect(SRC.match(/identifyPostHog\(/g)).toHaveLength(1);
    });
});

describe('P1-PLAN-LOTE-794 · la Política de Privacidad dice lo que hace el código', () => {
    const LEGAL = fs.readFileSync(path.resolve(__dirname, '../pages/legal/LegalPages.jsx'), 'utf8');
    const inicio = LEGAL.indexOf('title="Política de Privacidad"');
    const privacidad = LEGAL.slice(inicio, LEGAL.indexOf('title="Términos de Servicio"', inicio));

    it('ya no afirma que PostHog guarda una cookie o una entrada de localStorage', () => {
        expect(privacidad).not.toMatch(/Sí utilizamos una cookie de <strong>analítica/);
        expect(privacidad).not.toMatch(/PostHog \(analítica de producto\):<\/strong> guarda una cookie/);
    });

    it('dice que PostHog no guarda nada en el dispositivo', () => {
        const linea = privacidad.slice(privacidad.indexOf('<strong>PostHog (analítica de producto):</strong>'));
        // [ronda 1] Redacción del landing: «no guarda cookies ni entradas de localStorage».
        expect(linea.slice(0, 600)).toMatch(/no guarda cookies ni entradas de <code>localStorage<\/code>/);
    });

    it('la fecha de la política se movió con el cambio', () => {
        // [Delta legal n.º 1 · 2026-09-29] La del landing (content/privacy.html) también es la del 29.
        expect(privacidad).toContain('lastUpdated="29 de Septiembre, 2026"');
    });

    // [P1-PLAN-LOTE-794 · ronda 1] (revisión, defecto 7) La copia React y la del landing (rama
    // ia6d-legal, content/privacy.html) decían cosas distintas de PostHog. La del landing es la
    // cierta: bioboros.com es el sitio estático, que NO carga PostHog; y el identificador que PostHog
    // calcula en su servidor no se vende como «anónimo» — se dice qué recibe (IP y navegador).
    const seccion = (titulo) => {
        const ini = privacidad.indexOf(`<h3>${titulo}</h3>`);
        expect(ini, `falta la sección «${titulo}»`).toBeGreaterThan(-1);
        return privacidad.slice(ini, privacidad.indexOf('<h3>', ini + 4));
    };

    it('§7 dice lo mismo que el landing: las páginas de bioboros.com no cargan PostHog', () => {
        const s7 = seccion('7. Monitoreo de Errores y Telemetría');
        expect(s7).not.toMatch(/registramos únicamente la visita/);
        expect(s7).not.toMatch(/tanto dentro de la aplicación como en el sitio público/);
        expect(s7).toMatch(/no cargan PostHog/);
        expect(s7).toMatch(/PostHog recibe la dirección IP y el tipo de navegador o dispositivo/);
        expect(s7).toMatch(/sin cookies ni almacenamiento local/);
    });

    // [P1-PLAN-LOTE-794 · ronda 2] (re-verificación, defecto 1) §7 decía menos que el landing (2ab05b9):
    // faltaba el código seudónimo diario que PostHog calcula en su servidor.
    // [Delta legal n.º 1 · 2026-09-29] Y el autocapture ya NO manda el texto de lo que se pulsa: desde el lote
    // 716 (4ffc8391) observabilityScope.js pasa a posthog.init mask_all_text + mask_all_element_attributes
    // (prueba con el SDK real: rama lote-840 de la sesión 0f, lote840.test.js). §7 deja de decir «con el texto
    // visible de cada uno» y el ejemplo «Diabetes tipo 2»; §8 vuelve a decir que PostHog no recibe datos de
    // salud, con el mecanismo. Mismo texto que el landing (rama ia6d-integ-landing).
    // [Delta legal n.º 1 · ronda 2 · 2026-09-29] La máscara no bastaba: el revisor de 6d, con el SDK real, vio que
    // posthog-js 1.399.2 sigue mandando tag_name, classes, nth_child/nth_of_type y el href, y la posición del chip
    // de QMedical decía la condición. Lo que hace cierto el texto es el lote 842 (frontend cd3c7d3b, rama lote-840,
    // SIN desplegar): ph-no-capture en las preguntas del formulario y en la rejilla de Configuración
    // (lote842.test.jsx). Fuera de esas dos zonas la posición sigue viajando (medido: la escala de hambre y energía
    // de RenewalCheckinModal.jsx), así que §7 ya no dice «ni sus atributos» ni «no sabe qué opción eligió», y §8
    // dice qué NO recibe en vez de «No recibe datos de salud». Este texto sólo se publica con cd3c7d3b desplegado.
    // [Delta legal n.º 1 · ronda 3 · 2026-09-29] El revisor de 6d, con el SDK real, encontró lo que cd3c7d3b dejaba
    // fuera, y la sesión 0f lo cerró en frontend 3d6d079b (misma rama lote-840, SIN desplegar): ph-no-capture en el
    // contenedor ENTERO de Configuración (Settings.jsx, styles.wrapper), en la raíz del portal de EvaluarDeNuevoModal,
    // en la raíz de RenewalCheckinModal (peso, hambre, energía, adherencia) y en la fila de vasos de WaterTracker
    // (lote842.test.jsx, 5 casos). Los eventos PROPIOS no miran la clase: de Configuración salen locale_changed
    // (i18n/index.js:810, desde Settings.jsx:457) y plan_regeneration_triggered con account_reset (Settings.jsx:2927),
    // y §7 los nombra. §8 vuelve a decir «No recibe datos de salud», remitiendo a §7, y Protección de Datos §5 lo dice
    // en positivo. Fuera quedan tres controles del DIARIO con posición fija (Sorbo/Vaso/Botella del agua, la porción
    // del escáner, «Lo comí»): por eso §7 dice «los vasos del registro de agua». Sólo se publica con 3d6d079b desplegado.
    it('§7: las zonas sin autocapture, los eventos propios de Configuración y, fuera, el control sin su texto', () => {
        const s7 = seccion('7. Monitoreo de Errores y Telemetría');
        expect(s7).toMatch(/código seudónimo a partir de su dirección IP, su navegador y una clave que cambia cada día/);
        expect(s7).not.toMatch(/texto visible/);
        expect(s7).not.toMatch(/Diabetes tipo 2/);
        expect(s7).not.toMatch(/ni sus atributos/);
        expect(s7).not.toMatch(/no sabe qué opción eligió/);
        expect(s7).toMatch(/En el formulario de su perfil, en Configuración \(donde usted marca sus condiciones de salud, medicación, alergias y dieta\), en el chequeo de renovación de su plan \(su peso, su hambre, su energía y cuánto siguió el plan\) y en los vasos del registro de agua, no registra nada de lo que usted pulsa\./);
        expect(s7).toMatch(/De Configuración sólo recibe, como eventos propios de Bioboros, que usted cambió de idioma y a cuál, o que reinició su cuenta\./);
        expect(s7).toMatch(/En el resto de la aplicación registra qué controles pulsa, sin su texto: sí el tipo de control, su posición en la página, sus clases de estilo y, si es un enlace, su dirección\./);
        expect(s7).toMatch(/Nunca registra lo que usted escribe en los campos de texto/);
    });

    it('§8 dice que PostHog no recibe datos de salud, remitiendo a §7', () => {
        const s8 = seccion('8. Proveedores Subcontratados (Encargados de Tratamiento)');
        const posthog = s8.slice(s8.indexOf('<strong>PostHog, Inc.</strong>'));
        expect(posthog.slice(0, 450)).not.toMatch(/texto visible/);
        expect(posthog.slice(0, 450)).toMatch(/No recibe datos de salud: ni lo que usted marca en el formulario, en Configuración o en el chequeo de renovación, ni lo que escribe en los campos de texto \(ver Sección 7\)\./);
    });

    it('Protección de Datos §5 dice en positivo que la analítica no recibe datos de salud', () => {
        const ini = LEGAL.indexOf('5. Datos Sensibles de Salud');
        expect(ini, 'falta Protección de Datos §5').toBeGreaterThan(-1);
        const s5 = LEGAL.slice(ini, LEGAL.indexOf('<h3>', ini + 4));
        expect(s5).toMatch(/La analítica de producto \(PostHog\) no los recibe\./);
        expect(s5).not.toMatch(/puede recibir el texto de una opción de salud/);
    });

    it('§13 no dice «ni fingerprinting» y remite al código diario', () => {
        const s13 = seccion('13. Cookies y Almacenamiento Local');
        expect(s13).not.toMatch(/fingerprinting/);
        expect(s13).toMatch(/código seudónimo que cambia cada día/);
    });

    it('§13 no llama «anónimo» al identificador que PostHog calcula en su servidor', () => {
        const s13 = seccion('13. Cookies y Almacenamiento Local');
        expect(s13).not.toMatch(/identificador anónimo de visitante/);
        expect(s13).toMatch(/no guarda cookies ni entradas de <code>localStorage<\/code> en su dispositivo/);
        expect(s13).toMatch(/Contiene sólo esa elección, ningún identificador/);
    });

    // [P1-PLAN-LOTE-794 · ronda 1] (pedido del orquestador) ElevenLabs: el TTS del Modo Llamada está
    // apagado desde mayo (P1-DEADCODE-TTS, AgentPage.jsx vacía la cola sin llamar a /api/chat/tts), así
    // que producción no le envía nada. Nombrarlo como destinatario declara un tratamiento que no ocurre.
    it('no nombra a ElevenLabs como destinatario (producción no le envía nada desde mayo)', () => {
        expect(privacidad).not.toMatch(/ElevenLabs/i);
    });
});

describe('P1-PLAN-LOTE-794 · ronda 1 · quien tiene la analítica APAGADA también queda limpio', () => {
    // El `opt_out_capturing()` de antes TAMBIÉN escribía `__ph_opt_in_out_<token>` (con 0), así que la
    // clave la tiene sobre todo quien apagó la analítica. Y a ese usuario `initPostHog` no llega a
    // arrancar el SDK (sale por el opt-out), así que la limpieza no puede depender del SDK.
    let cliente;

    beforeAll(async () => {
        localStorage.clear();
        vi.stubEnv('VITE_POSTHOG_KEY', TOKEN);
        localStorage.setItem('mealfit_analytics_opt_out', '1');
        document.cookie = `${CLAVE_CONSENTIMIENTO}=0; path=/`;
        localStorage.setItem(CLAVE_CONSENTIMIENTO, '0');
        document.cookie = `${NOMBRE_PERSISTENCIA}=%7B%22distinct_id%22%3A%22viejo%22%7D; path=/`;
        localStorage.setItem(NOMBRE_PERSISTENCIA, '{"distinct_id":"viejo"}');
        delete window.posthog;
        vi.resetModules();
        cliente = await import('../utils/posthogClient');
        await cliente.initPostHog();
    });

    afterAll(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
    });

    it('no arranca el SDK, pero borra la clave de consentimiento y la persistencia vieja', () => {
        expect(window.posthog).toBeUndefined();
        expect(localStorage.getItem(CLAVE_CONSENTIMIENTO)).toBeNull();
        expect(localStorage.getItem(NOMBRE_PERSISTENCIA)).toBeNull();
        expect(document.cookie).not.toContain(CLAVE_CONSENTIMIENTO);
        expect(document.cookie).not.toContain(NOMBRE_PERSISTENCIA);
        expect(rastrosDePostHog()).toEqual([]);
        // La preferencia del usuario NO es un rastro de PostHog: se queda.
        expect(localStorage.getItem('mealfit_analytics_opt_out')).toBe('1');
    });
});
