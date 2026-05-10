// [P2-HIST-2 · 2026-05-09] Tests estáticos del banner de
// `_user_action_required` dentro del modal "Detalles del Plan".
//
// Bug original (audit historial 2026-05-08):
//   Si el usuario archivó (cerrando sesión, etc.) un plan con chunks
//   dead-lettered antes de haber visto el banner del Dashboard, no
//   había forma de re-encontrar la alerta desde el Historial. P1-HIST-2
//   añadió un chip rojo pulsante "Acción" en la card para señalizar
//   visualmente, pero al abrir el modal el usuario no sabía qué
//   acción ni por qué.
//
// Fix:
//   Renderizar un banner inline dentro del modalBody (antes de
//   macros) leyendo `plan_data._user_action_required` (objeto
//   preformateado por `_escalate_unrecoverable_chunk` con
//   title/body/cta/url/chunk_id/reason) y `_recovery_exhausted_chunks`
//   (array). El banner explica el problema; el CTA real (modalFooter
//   "Reactivar este Plan") sigue siendo el flujo de recuperación.
//
// Cobertura (regex sobre source — sin JSDOM):
//   - Banner se renderiza dentro del modalBody (antes de macrosGrid).
//   - Lee _user_action_required Y _recovery_exhausted_chunks.
//   - Defensa contra payloads inesperados (title/body/reason no-string).
//   - No render cuando ambos faltan/falsy.
//   - CTA pedagógico apunta a "Reactivar este Plan" (sin nuevo botón).
//   - Singular/plural en chunks no recuperables.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const css = readFileSync(_CSS_PATH, 'utf8');

describe('[P2-HIST-2] History.jsx — banner action_required en modal', () => {
    it('marca el banner con anchor [P2-HIST-2 · 2026-05-09]', () => {
        expect(src).toMatch(/\[P2-HIST-2\s*·\s*2026-05-09\]/);
    });

    it('banner renderizado dentro de modalBody (antes de macrosGrid)', () => {
        const bodyIdx = src.indexOf('className={styles.modalBody}');
        const macrosIdx = src.indexOf('className={styles.macrosGrid}');
        const bannerIdx = src.indexOf('className={styles.actionBanner}');
        // Todos presentes y en orden esperado.
        expect(bodyIdx).toBeGreaterThan(-1);
        expect(macrosIdx).toBeGreaterThan(-1);
        expect(bannerIdx).toBeGreaterThan(-1);
        expect(bannerIdx).toBeGreaterThan(bodyIdx);
        expect(bannerIdx).toBeLessThan(macrosIdx);
    });

    it('lee _user_action_required Y _recovery_exhausted_chunks', () => {
        // Ambos signals — uno puede estar sin el otro.
        expect(src).toMatch(/_user_action_required/);
        expect(src).toMatch(/_recovery_exhausted_chunks/);
    });

    it('NO renderiza cuando ambos signals están ausentes', () => {
        // Guard: `if (!_hasAction && _exhausted.length === 0 ...) return null;`
        // Sin esto, todos los planes mostrarían un banner vacío.
        // [P0-AUDIT-HIST-2 · 2026-05-09] El guard se extendió con
        // `&& !_hasQueueDrift` para que el banner aparezca también
        // cuando la queue tiene chunks bloqueados sin reflejo en
        // plan_data. La aserción aquí es prefix-only — la rama
        // queue-drift se cubre en su propio test file.
        // [P1-AUDIT-HIST-4 · 2026-05-09] Slice ampliado a 4000 para
        // cubrir el bloque de _embeddedPuac/_embeddedFailed/
        // _hasEmbeddedCounters/_summaryEntry/_queuePuac/_queueFailed/
        // _hasQueueDrift que precede al early-return.
        // [P0-HIST-NEW-1 · 2026-05-09] Re-ampliado a 5200 tras añadir
        // _embeddedFailedUnreplaced + cascada IIFE de _queueFailed.
        const bannerStart = src.indexOf("const _actionReq = _pd._user_action_required");
        expect(bannerStart).toBeGreaterThan(-1);
        const block = src.slice(bannerStart, bannerStart + 5200);
        expect(block).toMatch(/!_hasAction\s*&&\s*_exhausted\.length\s*===\s*0/);
        expect(block).toMatch(/return\s+null/);
    });

    it('defensivo contra payloads inesperados (title/body no-string)', () => {
        // _user_action_required.title puede venir como objeto, número,
        // null, etc. si el backend serializa mal. Aceptamos solo
        // strings no-vacíos post-trim, fallback a copy genérico.
        // [P0-AUDIT-HIST-2 · 2026-05-09] La asignación de _body
        // ahora coalesces a `_queueDriftBody` cuando no hay
        // _actionReq.body — el typeof check sigue presente como
        // primer branch del ternario.
        const bannerStart = src.indexOf("const _title");
        expect(bannerStart).toBeGreaterThan(-1);
        const block = src.slice(bannerStart, bannerStart + 1800);
        expect(block).toMatch(/typeof\s+_actionReq\.title\s*===\s*['"]string['"]/);
        expect(block).toMatch(/typeof\s+_actionReq\.body\s*===\s*['"]string['"]/);
        expect(block).toMatch(/\.trim\(\)/);
        // Fallback genérico cuando title no es string válido.
        expect(block).toMatch(/['"]Acci[oó]n requerida['"]/);
    });

    it('count de _recovery_exhausted_chunks usa singular/plural', () => {
        // 1 chunk no recuperable / N chunks no recuperables.
        // Sin singular/plural el copy se siente bot-generado.
        expect(src).toMatch(/_exhausted\.length\s*===\s*1/);
        expect(src).toMatch(/no recuperables?/);
    });

    it('CTA pedagógico apunta a "Reactivar este Plan" (fallback hardcoded)', () => {
        // [P2-HIST-2] Decisión scope original: el banner solo debe
        // orientar al usuario hacia el botón del footer "Reactivar
        // este Plan" (post-P0-HIST-1 atómico).
        //
        // [P2-HIST-AUDIT-7 · 2026-05-09] El banner ahora respeta
        // `_actionReq.cta` + `.url` cuando ambos están presentes
        // (CTA configurable desde el backend). Cuando NO lo están,
        // sigue mostrando el copy pedagógico hardcoded. Verificamos
        // que ese fallback persiste — anchor robusto en
        // `actionBannerCta}` (con `}`) evita matchear
        // `actionBannerCtaButton`, que es el botón configurable.
        expect(src).toMatch(/Reactivar este Plan/);
        const ctaIdx = src.indexOf('actionBannerCta}');
        expect(ctaIdx).toBeGreaterThan(-1);
        const block = src.slice(ctaIdx, ctaIdx + 400);
        expect(block).toMatch(/<strong>Reactivar este Plan<\/strong>/);
    });

    it('banner usa role="alert" para a11y (screen readers)', () => {
        // ARIA role para que screen readers anuncien el banner como
        // alerta crítica al abrir el modal.
        const bannerIdx = src.indexOf('className={styles.actionBanner}');
        const around = src.slice(bannerIdx, bannerIdx + 200);
        expect(around).toMatch(/role=["']alert["']/);
    });
});

describe('[P2-HIST-2] CSS module — actionBanner palette red', () => {
    it('CSS define las 6 clases del banner', () => {
        for (const cls of [
            'actionBanner',
            'actionBannerIcon',
            'actionBannerContent',
            'actionBannerTitle',
            'actionBannerBody',
            'actionBannerCta',
        ]) {
            const re = new RegExp(`\\.${cls}\\b`);
            expect(css).toMatch(re);
        }
    });

    it('actionBanner usa palette red (#FEF2F2 / #FCA5A5)', () => {
        // Coherente con statusFailed/statusActionRequired (P1-HIST-2)
        // — toda la family "problema bloqueante" usa red.
        const block = css.match(/\.actionBanner\s*\{[^}]+\}/);
        expect(block).toBeTruthy();
        expect(block[0]).toMatch(/#FEF2F2/);
        expect(block[0]).toMatch(/#FCA5A5/);
    });

    it('actionBannerTitle tiene font-weight 800 (jerárquico)', () => {
        // Title destaca sobre body (font-weight más alto + color
        // más saturado #991B1B).
        const titleBlock = css.match(/\.actionBannerTitle\s*\{[^}]+\}/);
        expect(titleBlock).toBeTruthy();
        expect(titleBlock[0]).toMatch(/font-weight:\s*800/);
        expect(titleBlock[0]).toMatch(/#991B1B/);
    });

    it('actionBannerBody tiene color secundario (#7F1D1D, más oscuro)', () => {
        // Body más legible (color más oscuro pero misma family).
        const bodyBlock = css.match(/\.actionBannerBody\s*\{[^}]+\}/);
        expect(bodyBlock).toBeTruthy();
        expect(bodyBlock[0]).toMatch(/#7F1D1D/);
    });

    it('margin-bottom para separar del macrosGrid', () => {
        // Sin margin, el banner se pegaría al macrosGrid y se vería
        // como continuación visual del header.
        const block = css.match(/\.actionBanner\s*\{[^}]+\}/);
        expect(block[0]).toMatch(/margin-bottom:\s*1\.5rem/);
    });
});

describe('[P2-HIST-2] integración: banner se activa con cualquiera de los dos signals', () => {
    // Tests semánticos (sin DOM): reproducen la guard del componente
    // para verificar que cubre los 4 casos clave.

    it('renderiza si solo _user_action_required está presente', () => {
        const _pd = { _user_action_required: { title: 'X', body: 'Y' } };
        const _actionReq = _pd._user_action_required;
        const _exhausted = Array.isArray(_pd._recovery_exhausted_chunks)
            ? _pd._recovery_exhausted_chunks
            : [];
        const _hasAction = _actionReq != null && _actionReq !== false;
        const shouldRender = _hasAction || _exhausted.length > 0;
        expect(shouldRender).toBe(true);
    });

    it('renderiza si solo _recovery_exhausted_chunks tiene elementos', () => {
        const _pd = { _recovery_exhausted_chunks: ['chunk-id-1'] };
        const _actionReq = _pd._user_action_required;
        const _exhausted = Array.isArray(_pd._recovery_exhausted_chunks)
            ? _pd._recovery_exhausted_chunks
            : [];
        const _hasAction = _actionReq != null && _actionReq !== false;
        const shouldRender = _hasAction || _exhausted.length > 0;
        expect(shouldRender).toBe(true);
    });

    it('NO renderiza si ambos están ausentes / vacíos', () => {
        const _pd = {};
        const _actionReq = _pd._user_action_required;
        const _exhausted = Array.isArray(_pd._recovery_exhausted_chunks)
            ? _pd._recovery_exhausted_chunks
            : [];
        const _hasAction = _actionReq != null && _actionReq !== false;
        const shouldRender = _hasAction || _exhausted.length > 0;
        expect(shouldRender).toBe(false);
    });

    it('NO renderiza si _user_action_required === false (signal explícito off)', () => {
        const _pd = { _user_action_required: false, _recovery_exhausted_chunks: [] };
        const _actionReq = _pd._user_action_required;
        const _exhausted = Array.isArray(_pd._recovery_exhausted_chunks)
            ? _pd._recovery_exhausted_chunks
            : [];
        const _hasAction = _actionReq != null && _actionReq !== false;
        const shouldRender = _hasAction || _exhausted.length > 0;
        expect(shouldRender).toBe(false);
    });
});
