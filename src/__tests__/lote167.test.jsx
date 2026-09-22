// [P1-PLAN-LOTE-167 · 2026-09-22] Idiomas: el francés con una sola forma de tratamiento y lo que quedaba en español
// o fijo en los cinco idiomas.
//
// 1. El francés tuteaba en 68 textos y vouvoyait en 752: todo a «vous» (y las comillas rectas, a « »).
// 2. Los errores del generador (SSE y run fallido) llegaban con la prosa española del servidor: por código fuera del
//    español; la cancelación se reconoce por su código y no solo por su frase española.
// 3. «Me lo comí» y «arreglar el día» pintaban el `detail` del servidor tal cual.
// 4. El saludo del panel seguía en el idioma anterior hasta 2 h.
// 5. La hora de «Me lo comí» era «13:30» fijo; la palabra para borrar la cuenta, «ELIMINAR» en los cinco; «~1 semanas».
// 6. Al cambiar de idioma, los avisos ya programados en el teléfono se reprograman.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadLocale, t, tn, formatDate } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';
import { mensajeDeError } from '../utils/errorCopy';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

afterEach(async () => { await loadLocale(DEFAULT_LOCALE); });

describe('lote 167 · el francés vouvoie', () => {
    it('ningún valor del catálogo tutea y no quedan comillas rectas fuera de HTML', () => {
        const fr = JSON.parse(leer('src/i18n/locales/fr-FR.json'));
        const TU = /(?<![\p{L}'’-])(tu|toi|ton|ta|tes|te|t['’])(?![\p{L}-])/iu;
        const tutean = Object.entries(fr).filter(([, v]) => typeof v === 'string' && TU.test(v)).map(([k]) => k);
        expect(tutean).toEqual([]);
        const rectas = Object.entries(fr).filter(([, v]) => typeof v === 'string' && v.includes('"') && !v.includes('<'));
        expect(rectas).toEqual([]);
    });

    it('la promesa de cerrar sesión, en «vous»', async () => {
        await loadLocale('fr-FR');
        expect(t('Tu plan, tu Nevera y tu historial quedan guardados en tu cuenta.'))
            .toBe('Votre plan, votre Frigo et votre historique restent enregistrés dans votre compte.');
    });
});

describe('lote 167 · los errores del generador, por código fuera del español', () => {
    it('el rechazo crítico tiene copy propio', async () => {
        await loadLocale('en-US');
        const msg = mensajeDeError({ code: 'critical_restriction', message: 'No pudimos respetar tu alergia a Maní' }, t('La generación falló.'), t);
        expect(msg).not.toMatch(/Maní|pudimos/);
        expect(msg).toBe(t('No pudimos generar un plan que respete tus restricciones declaradas. Ajústalas e intenta de nuevo.'));
    });

    it('SSE y run fallido: la prosa del servidor solo en español; la cancelación también por código', () => {
        const p = leer('src/pages/Plan.jsx');
        const i = p.indexOf("if (eventType === 'error') {");
        const sse = p.slice(i, i + 1100);
        expect(sse).toContain("String(getLocale() || '').startsWith('es'))");
        expect(sse).toContain("mensajeDeError(eventData.data, t('La generación falló.'), t)");
        expect(sse).not.toContain("new Error(eventData.data?.message || 'Error del servidor')");
        expect(p).toContain("error.code === 'user_cancelled' ||");
        expect(p).toContain("mensajeDeError({ code: snap.error_code }, t('La generación falló.'), t)");
        expect(p).not.toContain("new Error(snap.error_message || t('La generación falló.'))");
    });

    it('«Me lo comí» y «arreglar el día» no pintan el detail del servidor', () => {
        const d = leer('src/pages/Dashboard.jsx');
        expect(d).not.toContain("(typeof result?.detail === 'string' ? result.detail : null)");
        expect(d.match(/const msg = mensajeDeError\(result, t\('Inténtalo de nuevo en un momento\.'\), t\);/g)).toHaveLength(2);
    });
});

describe('lote 167 · lo que estaba fijo en los cinco idiomas', () => {
    it('el saludo del panel se vuelve a elegir al cambiar de idioma (y cuando llega su catálogo)', () => {
        const d = leer('src/pages/Dashboard.jsx');
        expect(d).toContain('useEffect(() => { setG(_pickGreeting()); }, [locale, catalogVersion]);');
    });

    it('la hora de «Me lo comí» sale en el formato del idioma', async () => {
        const s = leer('src/components/dashboard/EatPlanMealSheet.jsx');
        expect(s).toContain("formatDate(d, { hour: 'numeric', minute: '2-digit' })");
        await loadLocale('en-US');
        expect(formatDate(new Date(2026, 8, 22, 13, 30), { hour: 'numeric', minute: '2-digit' })).toMatch(/1:30\s?PM/);
    });

    it('la palabra para borrar la cuenta es la del idioma; al servidor sigue llegando ELIMINAR', async () => {
        const s = leer('src/components/account/DeleteAccountSection.jsx');
        expect(s).toContain("const palabra = t('ELIMINAR');");
        expect(s).toContain('placeholder={palabra}');
        expect(s).toContain("t('Escribe {palabra} para confirmar', { palabra })");
        expect(s).toContain("JSON.stringify({ confirm: 'ELIMINAR' })");
        expect(s).toContain("escrito === palabra.toUpperCase() || escrito === 'ELIMINAR'");
        await loadLocale('fr-FR');
        expect(t('ELIMINAR')).toBe('SUPPRIMER');
    });

    it('«~1 semana», no «~1 semanas»', async () => {
        const uno = (n) => tn(n, 'Meta: {peso} · ~{semanas} semana a tu ritmo', 'Meta: {peso} · ~{semanas} semanas a tu ritmo',
            { peso: '70 kg', semanas: n });
        expect(uno(1)).toBe('Meta: 70 kg · ~1 semana a tu ritmo');
        await loadLocale('en-US');
        expect(uno(1)).toBe('Goal: 70 kg · ~1 week at your pace');
        expect(uno(3)).toBe('Goal: 70 kg · ~3 weeks at your pace');
    });

    it('al guardar el idioma se reprograman los avisos del teléfono', () => {
        const s = leer('src/pages/Settings.jsx');
        const i = s.indexOf("toast.success(t('Idioma guardado.'), { duration: 2000 });");
        expect(s.slice(i, i + 500)).toContain('sincronizarAvisosLocales().catch(() => {});');
    });
});
