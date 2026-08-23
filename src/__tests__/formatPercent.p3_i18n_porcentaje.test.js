/**
 * [P3-I18N-PORCENTAJE-PEGADO-AL-NUMERO · 2026-08-23] Siete `{x}%` pegados a mano en el
 * dashboard pintaban «50%» a un francés; el francés escribe «50 %» (espacio fino
 * irrompible antes del signo). `formatPercent(puntos)` delega en `Intl` con el locale
 * activo: «50%» en es/en/pt/it, «50 %» en fr. Recibe PUNTOS (50), no fracción.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatPercent, loadLocale } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';

describe('[P3-I18N-PORCENTAJE-PEGADO-AL-NUMERO] formatPercent', () => {
    afterEach(async () => { await loadLocale(DEFAULT_LOCALE); });

    it('en francés, espacio fino irrompible antes del signo', async () => {
        await loadLocale('fr-FR');
        const out = formatPercent(50);
        // U+202F (fino) o U+00A0 (normal) seg\u00fan los datos ICU del runtime: los dos son
        // irrompibles, que es la propiedad. Lo que NO vale es el espacio normal ni ninguno.
        expect(out).toMatch(/^50[\u00a0\u202f]%$/);
        expect(out).not.toBe('50%');
    });

    it('en es-DO, inglés, portugués e italiano va pegado', async () => {
        for (const loc of [DEFAULT_LOCALE, 'en-US', 'pt-BR', 'it-IT']) {
            await loadLocale(loc);
            expect(formatPercent(50), loc).toBe('50%');
        }
    });

    it('recibe puntos, redondea a entero por defecto y tolera basura', async () => {
        expect(formatPercent(33.333)).toBe('33%');
        expect(formatPercent(33.333, { maximumFractionDigits: 1 })).toBe('33.3%');
        expect(formatPercent('abc')).toBe('');
        expect(formatPercent(undefined)).toBe('');
    });

    it('los call sites del dashboard ya no pegan el signo a mano', () => {
        const ficheros = [
            'components/dashboard/MicronutrientMeter.jsx',
            'components/dashboard/WaterTracker.jsx',
            'components/dashboard/TrackingProgress.jsx',
            'components/plan/RenewalCheckinModal.jsx',
        ];
        for (const f of ficheros) {
            const src = readFileSync(resolve(__dirname, '..', f), 'utf8');
            // La forma del defecto: `{expr}%` seguido de cierre de etiqueta o fin de línea
            // dentro del JSX (no `style={{ left: \`${x}%\` }}`, que es CSS y va pegado).
            const pegados = src.match(/\{[A-Za-z_.()0-9 ]+\}%(<|\s*$)/gm) || [];
            expect(pegados, `${f}: ${pegados.join(' | ')}`).toEqual([]);
            expect(src).toMatch(/formatPercent\(/);
        }
    });
});
