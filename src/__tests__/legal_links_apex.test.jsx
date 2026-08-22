/**
 * [P1-LEGAL-LINKS-APEX · 2026-08-22] Las políticas del dashboard se leen en el apex,
 * también desde la app nativa.
 *
 * POR QUÉ. El 2026-08-19 se decidió que hay UNA sola copia de cada texto legal, en
 * bioboros.com (`P1-LEGAL-UNA-SOLA-COPIA`). Esa decisión se apoyaba en dos mitades:
 * el 301 de nginx sobre app.bioboros.com/privacy y los <a> ABSOLUTOS del pie.
 * Pero siete enlaces del dashboard seguían siendo relativos (`href="/privacy"`):
 * en la web funcionaban POR el 301, no por diseño.
 *
 * En el binario de la App Store no hay nginx: la app vive en `capacitor://localhost`
 * y `href="/privacy"` abre la ruta interna, que sirve la copia JSX —la que el
 * 2026-08-22 quedó OBSOLETA frente al apex (proveedores de IA, RGPD, escáner)—.
 * Apple exige que la política de privacidad sea accesible desde dentro de la app;
 * servir ahí una versión distinta de la pública es peor que no servir ninguna.
 *
 * Y `apexUrl()` tampoco bastaba: con hostname `localhost` devuelve la ruta
 * RELATIVA (pensado para dev), así que en nativo habría dado el mismo resultado.
 *
 * LAS DOS MITADES que este test ancla:
 *   1. `apexUrl()` en nativo devuelve el apex ABSOLUTO aunque el host sea localhost.
 *   2. Ningún enlace legal del dashboard es relativo: todos pasan por `apexUrl()`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// La sonda se INYECTA (site.js no puede importar platform: lo cargan scripts de
// Node sin Capacitor — el build del VPS lo enseñó en rojo). El test ejercita el
// mecanismo real en vez de mockear isNativeApp: registra una sonda y la retira.
import { apexUrl, APEX_ORIGIN, registerNativeProbe } from '../config/site';
import { isNativeApp } from '../config/platform';

const nativeFlag = { value: false };

const _dir = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.join(_dir, '..', rel), 'utf-8');

const RUTAS_LEGALES = [
    'privacy', 'terms', 'data-protection', 'ai-policy', 'medical',
    'research', 'refunds', 'acceptable-use', 'security',
];

describe('[P1-LEGAL-LINKS-APEX] apexUrl() en la app nativa', () => {
    beforeEach(() => { nativeFlag.value = false; registerNativeProbe(() => nativeFlag.value); });
    afterEach(() => { nativeFlag.value = false; registerNativeProbe(isNativeApp); });

    it('en nativo devuelve el apex absoluto aunque el host sea localhost', () => {
        nativeFlag.value = true;
        // jsdom: window.location.hostname === 'localhost', igual que capacitor://localhost
        expect(apexUrl('/privacy')).toBe(`${APEX_ORIGIN}/privacy`);
    });

    it('en web-dev (localhost, NO nativo) sigue devolviendo la ruta interna', () => {
        expect(apexUrl('/privacy')).toBe('/privacy');
    });

    // Sin esto, la feature nace INERTE: una sonda que nadie registra es `() => false`
    // para siempre y el test de arriba sólo probaría que el mecanismo existe.
    it('platform.js registra la sonda al cargarse (no es un hook muerto)', () => {
        const code = src('config/platform.js');
        expect(code).toMatch(/registerNativeProbe\(isNativeApp\)/);
    });

    it('site.js NO importa platform (lo cargan scripts de Node sin Capacitor)', () => {
        expect(src('config/site.js')).not.toMatch(/from ['"]\.\/platform['"]/);
    });
});

describe('[P1-LEGAL-LINKS-APEX] ningún enlace legal del dashboard es relativo', () => {
    const patron = new RegExp(
        `(href=["']|path:\\s*["'])/(${RUTAS_LEGALES.join('|')})["']`,
        'g',
    );

    it.each([
        ['pages/Settings.jsx'],
        ['pages/Upgrade.jsx'],
    ])('%s enlaza las políticas vía apexUrl()', (rel) => {
        const code = src(rel);
        const relativos = [...code.matchAll(patron)].map((m) => m[0]);
        expect(
            relativos,
            `${rel} tiene enlaces legales RELATIVOS: ${relativos.join(', ')}. `
            + 'En capacitor:// abren la copia JSX obsoleta; en web funcionan sólo por el 301 de nginx. '
            + 'Usa apexUrl("/ruta").',
        ).toEqual([]);
        expect(code).toMatch(/apexUrl\(/);
    });
});
