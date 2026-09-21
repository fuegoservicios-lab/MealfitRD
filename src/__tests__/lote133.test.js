// [P1-PLAN-LOTE-133 · 2026-09-20] «Alertas Inteligentes» lista para producción, y sin el «Beta».
//
// El dueño: «revisa a profundidad el sistema de notificaciones: quiero que le avise al usuario si no ha desayunado,
// almorzado, merendado… déjalo 100 % listo para producción, y quítale ese beta».
//
// Medido en producción antes de tocar nada: el servidor genera los avisos (38 en 5 días) y `push_subscriptions` tenía UNA
// fila. En la app nativa (WKWebView, sin Service Worker ni PushManager) el interruptor no podía funcionar. Ahora hay UNA
// fachada (`utils/avisosDeComida.js`): Web Push en navegador/PWA y notificaciones LOCALES en la app nativa, programadas
// con las horas que da el servidor (`GET /api/notifications/meal-reminders`, la misma cuenta que el cron del chat).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { canalDeAvisos, notificacionesAProgramar, idsPropios, ID_BASE, DIAS_PROGRAMADOS } from '../utils/avisosDeComida';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

const RESPUESTA = {
    enabled: true,
    url: '/dashboard/agent',
    reminders: [
        { meal: 'desayuno', hour: 10, minute: 35, title: 'Bioboros', body: '¿Ya desayunaste?', logged_today: true },
        { meal: 'almuerzo', hour: 14, minute: 35, title: 'Bioboros', body: '¿Ya almorzaste?', logged_today: false },
        { meal: 'merienda', hour: 17, minute: 35, title: 'Bioboros', body: '¿Ya merendaste?', logged_today: false },
        { meal: 'cena', hour: 21, minute: 35, title: 'Bioboros', body: '¿Ya cenaste?', logged_today: false },
    ],
};

describe('lote 133 · el canal de avisos de cada dispositivo', () => {
    it('la app nativa usa avisos locales; un binario sin el plugin pide actualizar (no un interruptor muerto)', () => {
        expect(canalDeAvisos({ esNativa: true, pluginLocal: true })).toBe('local');
        expect(canalDeAvisos({ esNativa: true, pluginLocal: false, pushSoportado: true })).toBe('nativa-actualizar');
    });

    it('navegador y PWA instalada: Web Push; Safari del iPhone sin instalar: instrucciones; el resto, sin soporte', () => {
        expect(canalDeAvisos({ pushSoportado: true })).toBe('web-push');
        expect(canalDeAvisos({ pushSoportado: false, esIOS: true, esInstalada: false })).toBe('ios-instalar');
        expect(canalDeAvisos({ pushSoportado: false, esIOS: true, esInstalada: true })).toBe('sin-soporte');
        expect(canalDeAvisos({})).toBe('sin-soporte');
    });
});

describe('lote 133 · qué programa el teléfono', () => {
    const ahora = new Date(2026, 8, 20, 15, 0, 0);   // 20-sep, 3:00 pm

    it('hoy: ni lo ya registrado ni lo que ya pasó; los otros seis días, las cuatro comidas', () => {
        const n = notificacionesAProgramar(RESPUESTA, ahora);
        const hoy = n.filter((x) => x.schedule.at.getDate() === 20);
        expect(hoy.map((x) => x.extra.meal)).toEqual(['merienda', 'cena']);   // desayuno registrado; almuerzo (14:35) ya pasó
        expect(n.length).toBe(2 + 4 * (DIAS_PROGRAMADOS - 1));
        const manana = n.filter((x) => x.schedule.at.getDate() === 21);
        expect(manana.map((x) => x.extra.meal)).toEqual(['desayuno', 'almuerzo', 'merienda', 'cena']);
        expect(manana[0].schedule.at.getHours()).toBe(10);
        expect(manana[0].schedule.at.getMinutes()).toBe(35);
    });

    it('ids propios y deterministas: cancelar «los nuestros» no toca ninguna otra notificación', () => {
        const n = notificacionesAProgramar(RESPUESTA, ahora);
        const propios = new Set(idsPropios());
        expect(n.every((x) => propios.has(x.id))).toBe(true);
        expect(new Set(n.map((x) => x.id)).size).toBe(n.length);
        expect(Math.min(...idsPropios())).toBe(ID_BASE);
        // [P1-PLAN-LOTE-135] …más el rango del agua (4200+), que se cancela con los mismos 7 días
        expect(idsPropios().length).toBe(DIAS_PROGRAMADOS * 10 * 2);
    });

    it('apagado por el servidor (turno nocturno/rotativo), o respuesta rota: no se programa nada', () => {
        expect(notificacionesAProgramar({ enabled: false, reason: 'schedule', reminders: [] }, ahora)).toEqual([]);
        expect(notificacionesAProgramar(null, ahora)).toEqual([]);
        expect(notificacionesAProgramar({ enabled: true, reminders: [{ hour: 99, body: 'x' }, { hour: 9 }] }, ahora)).toEqual([]);
    });

    it('tocar el aviso lleva al chat', () => {
        const n = notificacionesAProgramar(RESPUESTA, ahora);
        expect(n[0].extra.url).toBe('/dashboard/agent');
        expect(n[0].threadIdentifier).toBe('comidas');
    });
});

describe('lote 133 · el interruptor de Configuración', () => {
    const st = leer('src/pages/Settings.jsx');
    const k = st.indexOf("{t('Alertas Inteligentes')}");
    const tarjeta = st.slice(k, st.indexOf('{/* SECCIÓN PREFERENCIAS', k));

    it('ya no lleva «Beta» (la insignia de país, que es otra, sigue)', () => {
        expect(tarjeta).not.toMatch(/>\s*Beta\s*</);
        expect(tarjeta).not.toContain("t('Beta')");
        expect(st).toContain("t('Beta')");
    });

    it('habla con la fachada, no con la Web Push a pelo', () => {
        // [lote 150] la lista de nombres crece (entró `sincronizarAvisosLocales`); lo que este test protege es de
        // DÓNDE vienen: la fachada, nunca la Web Push a pelo.
        expect(st).toMatch(/import \{[^}]*estadoDeAvisos[^}]*activarAvisos[^}]*desactivarAvisos[^}]*interruptorAlNacer[^}]*elPermisoEsDelNavegador[^}]*\} from '\.\.\/utils\/avisosDeComida';/);
        expect(st).toContain('const [pushEnabled, setPushEnabled] = useState(interruptorAlNacer);');
        expect(st).not.toContain("from '../utils/pushNotifications'");
        expect(st).toContain('const r = await activarAvisos();');
        expect(st).toContain('const r = await desactivarAvisos();');
    });

    it('el interruptor solo se pinta donde puede funcionar; si no, se dice qué hacer', () => {
        expect(tarjeta).toContain("(canalAvisos === null || canalAvisos === 'web-push' || canalAvisos === 'local') && (");
        expect(tarjeta).toContain("canalAvisos === 'ios-instalar' || canalAvisos === 'nativa-actualizar' || canalAvisos === 'sin-soporte'");
        expect(tarjeta).toContain("aria-label={t('Alertas Inteligentes')}");
    });

    it('el aviso de error decide por CÓDIGO, no releyendo prosa traducida', () => {
        expect(tarjeta).toContain("pushSubscribeError.code === 'brave_blocks_push'");
        expect(tarjeta).not.toContain("pushSubscribeError.includes(");
    });
});

describe('lote 133 · lo demás que hacía falta', () => {
    it('el aviso de bienvenida respeta el resultado y también se ofrece en la app nativa', () => {
        const db = leer('src/pages/Dashboard.jsx');
        expect(db).toContain('const r = await activarAvisos();');
        expect(db).not.toContain('await subscribeToPushNotifications(userProfile.id);');
        expect(db).toContain("if (estado.canal !== 'web-push' && estado.canal !== 'local') return;");
    });

    it('cerrar sesión apaga los avisos de ESTA cuenta en este dispositivo, antes de soltar el token', () => {
        const ctx = leer('src/context/AssessmentContext.jsx');
        const i = ctx.indexOf('await apagarAvisosAlCerrarSesion();');
        expect(i).toBeGreaterThan(-1);
        expect(i).toBeLessThan(ctx.indexOf('await logoutFirstPartySession();'));
    });

    it('la app nativa arranca la sincronización sin meter el plugin en el chunk de entrada', () => {
        const main = leer('src/main.jsx');
        expect(main).toMatch(/if \(isNativeApp\(\)\) \{\n\s+import\('\.\/utils\/avisosDeComida'\)\n\s+\.then\(\(m\) => m\.iniciarAvisosLocales\(\)\)/);
        const av = leer('src/utils/avisosDeComida.js');
        expect(av).toContain("await import('@capacitor/local-notifications')");
        // platform.js es el ÚNICO que habla con @capacitor/core (NativeShell.contract): la fachada pregunta por el plugin ahí
        expect(av).toContain("if (!nativePluginAvailable('LocalNotifications')) return null;");
        expect(av).not.toContain('@capacitor/core');
        expect(leer('src/config/platform.js')).toContain('export function nativePluginAvailable(name) {');
        expect(av).not.toMatch(/^import .*@capacitor\/local-notifications/m);
        expect(leer('package.json')).toContain('"@capacitor/local-notifications"');
    });

    it('el plugin entra en la foto del OTA SIN subir minNativeBuild: el JS corre en los binarios que aún no lo traen', () => {
        const cfg = JSON.parse(leer('ota.config.json'));
        expect(cfg.nativeDeps['@capacitor/local-notifications']).toBeTruthy();
        expect(cfg.minNativeBuild).toBe(13);
        expect(cfg._nota_lote_133).toContain('nativePluginAvailable');
    });

    it('los textos nuevos no hornean la marca ni resucitan el aviso de instalación que el lote 109 retiró', () => {
        const st = leer('src/pages/Settings.jsx');
        expect(st).toContain("t('Las notificaciones de {app} están apagadas en tu iPhone. Actívalas en Ajustes → Notificaciones → {app}.', { app: BRAND })");
        expect(st).toContain("instalada en tu pantalla de inicio. Ábrela desde ahí y actívalos.', { app: BRAND })");
        expect(leer('src/i18n/locales/en-US.json')).not.toContain('«Agregar a inicio»');
    });

    it('Service Worker: etiqueta por comida (no se apilan) y el toque lleva la app abierta al chat', () => {
        const sw = leer('src/custom-sw.js');
        expect(sw).toContain('notificationOptions.tag = data.tag.slice(0, 64);');
        expect(sw).toContain('return mismaApp.navigate(urlToOpen)');
    });
});
