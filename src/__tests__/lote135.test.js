// [P1-PLAN-LOTE-135 · 2026-09-20] Tres encargos del dueño con la captura del contador en su iPhone:
//   1. «¿Quieres que la IA te arme el plan?» salía «tan seguido»: una vez por SEMANA y por USUARIO (utils/planInvite.js).
//   2. Avisos de hidratación en la app nativa (notificaciones locales, junto a las de comida).
//   3. La hidratación que se apaga sola a las 48 h se DICE una vez, con el camino de vuelta.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { fetchWithAuth } from '../config/api';
import { escondidaHasta, leerInvitacion, anotarInvitacion, SEMANA_MS } from '../utils/planInvite';
import { avisosDeAguaAProgramar, idsPropios, ID_BASE_AGUA, DIAS_DE_AGUA } from '../utils/avisosDeComida';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const CLAVE = 'mealfit_turnon_card_dismissed';
const AHORA = Date.parse('2026-09-20T15:00:00Z');

beforeEach(() => {
    localStorage.clear();
    fetchWithAuth.mockReset();
});

describe('lote 135 · la invitación al plan: una vez por semana y por usuario', () => {
    it('el «1» heredado y el espejo de OTRO usuario no esconden nada: se pregunta al servidor', () => {
        localStorage.setItem(CLAVE, '1');
        expect(escondidaHasta(CLAVE, 'u1')).toBe(0);
        localStorage.setItem(CLAVE, JSON.stringify({ u: 'u2', until: AHORA + SEMANA_MS }));
        expect(escondidaHasta(CLAVE, 'u1')).toBe(0);
        expect(escondidaHasta(CLAVE, 'u2')).toBe(AHORA + SEMANA_MS);
    });

    it('«Ahora no» la esconde EN EL ACTO una semana, con o sin red, y se lo dice al servidor', async () => {
        fetchWithAuth.mockRejectedValue(new Error('sin red'));
        await anotarInvitacion(CLAVE, 'u1', 'dismiss', AHORA);
        expect(escondidaHasta(CLAVE, 'u1')).toBe(AHORA + SEMANA_MS);
        expect(fetchWithAuth).toHaveBeenCalledWith('/api/user/preferences/plan-invite', expect.objectContaining({
            method: 'PATCH', body: JSON.stringify({ action: 'dismiss' }),
        }));
        fetchWithAuth.mockClear();
        expect(await leerInvitacion(CLAVE, 'u1', AHORA + 1000)).toEqual({ visible: false });
        expect(fetchWithAuth).not.toHaveBeenCalled();   // lo que ya se sabe no se pregunta
    });

    it('el servidor manda: si dice que no toca, se recuerda hasta cuándo; si falla, se muestra', async () => {
        const vuelve = new Date(AHORA + 3 * 24 * 3600 * 1000).toISOString();
        fetchWithAuth.mockResolvedValueOnce({ ok: true, json: async () => ({ visible: false, next_at: vuelve }) });
        expect(await leerInvitacion(CLAVE, 'u1', AHORA)).toEqual({ visible: false });
        expect(escondidaHasta(CLAVE, 'u1')).toBe(Date.parse(vuelve));
        localStorage.clear();
        fetchWithAuth.mockResolvedValueOnce({ ok: false, status: 404 });   // frontend desplegado antes que el backend
        expect(await leerInvitacion(CLAVE, 'u1', AHORA)).toEqual({ visible: true });
    });

    it('la tarjeta NACE escondida, pregunta al volver a la app y conserva sus contratos', () => {
        const dt = leer('src/components/dashboard/DashboardTracking.jsx');
        expect(dt).toContain('const [dismissed, setDismissed] = useState(true);');
        expect(dt).toContain("if (r.visible) anotarInvitacion(_DISMISS_KEY, userId, 'seen');");
        expect(dt).toContain("document.addEventListener('visibilitychange', alVolver);");
        expect(dt.split('onClick={descartar}').length - 1).toBe(2);      // las dos ofertas: encender y reanudar
        expect(dt).toContain("_DISMISS_KEY = 'mealfit_turnon_card_dismissed'");
        expect(dt.match(/if \(dismissed\) return null;/g)).toHaveLength(2);
        expect(dt).not.toContain("safeLocalStorageSet(_DISMISS_KEY, '1')");
    });
});

describe('lote 135 · avisos de hidratación en el teléfono', () => {
    const agua = (extra = {}) => ({
        water: {
            enabled: true, days: 3, url: '/dashboard',
            reminders: [
                { kind: 'water', hour: 11, minute: 35, title: 'Hidratación', body: 'Llevas 4 de 9', body_generic: 'Genérico', met_today: true },
                { kind: 'water', hour: 15, minute: 35, title: 'Hidratación', body: 'Llevas 4 de 9', body_generic: 'Genérico', met_today: true },
                { kind: 'water', hour: 19, minute: 35, title: 'Hidratación', body: 'Llevas 4 de 9', body_generic: 'Genérico', met_today: false },
            ],
            ...extra,
        },
    });

    it('hoy solo lo que NO va al día y con su cuenta; los otros 2 días, todos con el texto genérico', () => {
        const n = avisosDeAguaAProgramar(agua(), new Date(2026, 8, 20, 9, 0, 0));
        expect(n.map((x) => x.id)).toEqual([4202, 4210, 4211, 4212, 4220, 4221, 4222]);
        expect(n[0].body).toBe('Llevas 4 de 9');
        expect(n.slice(1).every((x) => x.body === 'Genérico')).toBe(true);
        expect(n.every((x) => x.extra.url === '/dashboard' && x.extra.kind === 'water' && x.threadIdentifier === 'agua')).toBe(true);
        expect(DIAS_DE_AGUA).toBe(3);
    });

    it('lo que ya pasó hoy no se programa, y apagada no se programa nada', () => {
        const n = avisosDeAguaAProgramar(agua(), new Date(2026, 8, 20, 20, 0, 0));
        expect(n.map((x) => x.id)).toEqual([4210, 4211, 4212, 4220, 4221, 4222]);
        expect(avisosDeAguaAProgramar({ water: { enabled: false, reminders: [] } })).toEqual([]);
        expect(avisosDeAguaAProgramar({})).toEqual([]);
    });

    it('cancelar «los nuestros» incluye el rango del agua entero; el servidor sabe que el canal está vivo', () => {
        const ids = idsPropios();
        expect(ids).toHaveLength(140);
        expect(ids).toContain(ID_BASE_AGUA);
        expect(ids).toContain(ID_BASE_AGUA + 69);
        const av = leer('src/utils/avisosDeComida.js');
        expect(av).toContain("fetchWithAuth('/api/notifications/meal-reminders?canal=local')");
        expect(av).toContain('[...notificacionesAProgramar(datos), ...avisosDeAguaAProgramar(datos)]');
    });

    it('anotar agua re-sincroniza por el FINAL de la ráfaga (tres toques = 3 vasos, no el primero)', () => {
        const av = leer('src/utils/avisosDeComida.js');
        expect(av).toMatch(/window\.addEventListener\(EVENTO_AGUA_CAMBIO, \(\) => \{\s*if \(aguaTimer\) clearTimeout\(aguaTimer\);\s*aguaTimer = setTimeout\(/);
        const wt = leer('src/components/dashboard/WaterTracker.jsx');
        expect(wt).toContain("export const EVENTO_AGUA_CAMBIO = 'mealfit:water-changed';");
        expect(wt).toContain('window.dispatchEvent(new Event(EVENTO_AGUA_CAMBIO))');
    });
});

describe('lote 135 · la hidratación que se apaga sola lo dice una vez', () => {
    it('solo con el interruptor apagado, una vez por apagado, y con textos que el verificador de i18n ve', () => {
        const wt = leer('src/components/dashboard/WaterTracker.jsx');
        expect(wt).toContain("if (data?.enabled === false && typeof data?.auto_off_at === 'string' && data.auto_off_at");
        expect(wt).toContain('safeLocalStorageGet(LS_AUTO_OFF_VISTO, null) !== data.auto_off_at');
        expect(wt).toContain("titulo: t('Pausamos la hidratación'),");
        expect(wt).not.toMatch(/toast\(tRef\.current/);   // el verificador de i18n no ve un t(…) detrás de una ref
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(leer(`src/i18n/locales/${loc}.json`));
            expect(cat['Pausamos la hidratación']).toBeTruthy();
            expect(cat).not.toHaveProperty('Visible en tu Dashboard. Marca tus vasos diarios; la meta se calcula segun tu peso.');
        }
    });
});
