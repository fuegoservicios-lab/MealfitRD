// [P2-HIST-AUDIT-7 · 2026-05-09] Tests del CTA configurable en el
// banner action_required del modal del Historial.
//
// Bug original (audit historial 2026-05-08):
//   El banner ignoraba `_user_action_required.cta` y `.url` del payload
//   backend; renderizaba un copy hardcoded "Pulsa Reactivar este Plan
//   abajo…". Si el backend cambiaba el deeplink (e.g., directo al
//   endpoint regen-chunk), el frontend lo ignoraba.
//
// Fix:
//   - Si `_actionReq.cta` (label string) Y `_actionReq.url` (path
//     relativo SAFE) están presentes → render `<button>` que navega
//     allá vía useNavigate.
//   - Validación safe-path defensiva: la URL DEBE empezar con `/` y
//     NO contener `://` ni empezar con `//`. Cualquier URL inválida
//     cae al fallback hardcoded.
//
// Cobertura (static analysis del source):
//   - Anchor del marker.
//   - Lectura de `_actionReq.cta` y `_actionReq.url`.
//   - Validación safe-path (startsWith `/`, !startsWith `//`,
//     !includes `://`).
//   - Render condicional: `<button>` cuando _hasCustomCta, fallback
//     `<p>` cuando NO.
//   - onClick invoca navigate con la URL safe.
//   - CSS `.actionBannerCtaButton` definido.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const cssSrc = readFileSync(_CSS_PATH, 'utf8');


describe('[P2-HIST-AUDIT-7] anchor', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-7\s*·\s*2026-05-09\]/);
    });
});


describe('[P2-HIST-AUDIT-7] lectura del payload backend', () => {
    it('lee _actionReq.cta como string y trim', () => {
        const bannerIdx = src.indexOf('P2-HIST-AUDIT-7');
        expect(bannerIdx).toBeGreaterThan(-1);
        const block = src.slice(bannerIdx, bannerIdx + 3500);
        // Pattern: typeof _actionReq.cta === 'string' ... .cta.trim()
        expect(block).toMatch(/typeof\s+_actionReq\.cta\s*===\s*['"]string['"]/);
        expect(block).toMatch(/_actionReq\.cta\.trim\(\)/);
    });

    it('lee _actionReq.url como string y trim', () => {
        const bannerIdx = src.indexOf('P2-HIST-AUDIT-7');
        const block = src.slice(bannerIdx, bannerIdx + 3500);
        expect(block).toMatch(/typeof\s+_actionReq\.url\s*===\s*['"]string['"]/);
        // El trim del url puede estar al separar.
        expect(block).toMatch(/_actionReq\.url[\s\S]*?\.trim\(\)/);
    });
});


describe('[P2-HIST-AUDIT-7] validación safe-path', () => {
    const bannerIdx = src.indexOf('P2-HIST-AUDIT-7');
    const block = src.slice(bannerIdx, bannerIdx + 3500);

    it('exige que la URL empiece con "/"', () => {
        expect(block).toMatch(/_urlRaw\.startsWith\(\s*['"]\/['"]\s*\)/);
    });

    it('rechaza protocol-relative attack ("//evil.com")', () => {
        expect(block).toMatch(/!\s*_urlRaw\.startsWith\(\s*['"]\/\/['"]\s*\)/);
    });

    it('rechaza URLs absolutas con esquema ("://")', () => {
        expect(block).toMatch(/!\s*_urlRaw\.includes\(\s*['"]:\/\/['"]\s*\)/);
    });
});


describe('[P2-HIST-AUDIT-7] render condicional', () => {
    const bannerIdx = src.indexOf('P2-HIST-AUDIT-7');
    // Ventana grande: el comentario load-bearing es ~30 líneas;
    // el JSX (button + fallback p) viene después. Slice ampliado a
    // 10000 chars en P2-HIST-AUDIT-9 para acomodar la lista de
    // reasons per-chunk añadida antes del CTA.
    const block = src.slice(bannerIdx, bannerIdx + 10000);

    it('flag _hasCustomCta combina cta + urlSafe', () => {
        expect(block).toMatch(/_hasCustomCta\s*=\s*!!\s*\(\s*_cta\s*&&\s*_urlSafe\s*\)/);
    });

    it('renderiza <button> cuando _hasCustomCta es true', () => {
        expect(block).toMatch(/_hasCustomCta\s*\?\s*\(\s*<button/);
        expect(block).toMatch(/className=\{styles\.actionBannerCtaButton\}/);
        expect(block).toMatch(/onClick=\{\(\)\s*=>\s*navigate\(_urlSafe\)\}/);
    });

    it('fallback al copy hardcoded cuando NO hay custom CTA', () => {
        // El else del ternario debe tener el copy actual (Reactivar
        // este Plan abajo).
        expect(block).toMatch(/Pulsa\s*<strong>Reactivar este Plan<\/strong>/);
    });
});


describe('[P2-HIST-AUDIT-7] CSS del botón configurable', () => {
    it('styles.actionBannerCtaButton definido', () => {
        expect(cssSrc).toMatch(/\.actionBannerCtaButton\s*\{/);
    });

    it('styles.actionBannerCtaButton tiene focus-visible para a11y', () => {
        const matchAll = [...cssSrc.matchAll(/\.actionBannerCtaButton[^}]*\{[^}]*\}/g)];
        // Buscamos al menos una regla con `:focus-visible`.
        expect(cssSrc).toMatch(/\.actionBannerCtaButton:focus-visible/);
    });

    it('CSS coherente con palette del banner action_required (rojo)', () => {
        const blockMatch = cssSrc.match(/^\.actionBannerCtaButton\s*\{[\s\S]*?\}/m);
        expect(blockMatch).not.toBeNull();
        const block = blockMatch[0];
        // Background gradient con tonos rojos (Tailwind red-600/700).
        expect(block).toMatch(/#DC2626|#B91C1C/);
    });
});


describe('[P2-HIST-AUDIT-7] simulación de validación safe-path con casos reales', () => {
    // Re-implementamos la lógica del helper inline en JS y validamos
    // contra una matriz de casos. Esto NO es runtime de la página
    // (que requeriría montaje React); valida la INTENCIÓN del
    // safe-path filter — útil contra refactor cosméticos.
    const isSafe = (url) => {
        if (typeof url !== 'string') return false;
        const trimmed = url.trim();
        return (
            trimmed.startsWith('/')
            && !trimmed.startsWith('//')
            && !trimmed.includes('://')
        );
    };

    it('acepta paths relativos válidos', () => {
        expect(isSafe('/dashboard')).toBe(true);
        expect(isSafe('/plans/abc/regen-chunk/xyz')).toBe(true);
        expect(isSafe('/dashboard?regen=chunk-1')).toBe(true);
        expect(isSafe('/foo/bar#section')).toBe(true);
        // Trim al borde.
        expect(isSafe('  /dashboard  ')).toBe(true);
    });

    it('rechaza absolutas externas', () => {
        expect(isSafe('https://evil.com/steal')).toBe(false);
        expect(isSafe('http://evil.com')).toBe(false);
    });

    it('rechaza protocol-relative', () => {
        expect(isSafe('//evil.com/path')).toBe(false);
    });

    it('rechaza esquemas peligrosos', () => {
        expect(isSafe('javascript:alert(1)')).toBe(false);
        expect(isSafe('data:text/html,<script>')).toBe(false);
        expect(isSafe('file:///etc/passwd')).toBe(false);
    });

    it('rechaza paths sin "/" inicial', () => {
        expect(isSafe('dashboard')).toBe(false);
        expect(isSafe('?query=1')).toBe(false);
    });

    it('rechaza no-strings', () => {
        expect(isSafe(null)).toBe(false);
        expect(isSafe(undefined)).toBe(false);
        expect(isSafe(123)).toBe(false);
        expect(isSafe({})).toBe(false);
    });
});
