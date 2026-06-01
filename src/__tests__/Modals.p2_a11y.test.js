// [P2-CUSTOM-MODALS-A11Y · 2026-05-24] Tests parser-based del hook
// `useModalAccessibility` + integración en los 3 modales custom.
//
// Background:
//   Pre-fix los 3 modales custom no tenían role="dialog", aria-modal,
//   focus trap, ESC handler, ni restore focus al cerrar:
//     - PaymentModal.jsx — CRÍTICO: surface PayPal sin focus trap
//       permitía Tab escapar al fondo durante checkout. Layout split-
//       screen full-bleed NO encaja en Modal.jsx (maxWidth 460px).
//     - LogoutConfirmModal.jsx — confirm sin ESC handler ni dialog role.
//     - Dashboard.jsx restock modal inline — mismo modo de fallo.
//
// Fix:
//   Hook SSOT `frontend/src/hooks/useModalAccessibility.js` aplicado
//   inline a los 3 (preserva layouts custom). Hook provee focus trap,
//   ESC, restore focus al trigger, body overflow lock. El caller añade
//   role/aria-modal/aria-labelledby al root.
//
// Cobertura:
//   1. Hook existe + exporta named function + maneja Tab/Escape/triggerRef.
//   2. PaymentModal: import + invoca hook + role/aria/id.
//   3. LogoutConfirmModal: import + invoca hook + role/aria/id +
//      disableClose durante isLoading (logout en progreso).
//   4. Dashboard restock modal: import + invoca hook + role/aria/id +
//      disableClose durante isRestocking.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _HOOK_PATH = join(__dirname, '..', 'hooks', 'useModalAccessibility.js');
const _PAYMENT_PATH = join(__dirname, '..', 'components', 'dashboard', 'PaymentModal.jsx');
const _LOGOUT_PATH = join(__dirname, '..', 'components', 'dashboard', 'LogoutConfirmModal.jsx');
const _DASHBOARD_PATH = join(__dirname, '..', 'pages', 'Dashboard.jsx');
// [P3-DASH-MODALS-A11Y · 2026-05-30] DashboardLayout aloja el "Mobile More Menu".
const _LAYOUT_PATH = join(__dirname, '..', 'components', 'dashboard', 'DashboardLayout.jsx');

const hookSrc = readFileSync(_HOOK_PATH, 'utf8');
const paymentSrc = readFileSync(_PAYMENT_PATH, 'utf8');
const logoutSrc = readFileSync(_LOGOUT_PATH, 'utf8');
const dashboardSrc = readFileSync(_DASHBOARD_PATH, 'utf8');
const layoutSrc = readFileSync(_LAYOUT_PATH, 'utf8');


describe('[P2-CUSTOM-MODALS-A11Y] hook SSOT', () => {
    it('marker presente en useModalAccessibility.js', () => {
        expect(hookSrc).toMatch(/\[P2-CUSTOM-MODALS-A11Y\s*·\s*2026-05-24\]/);
    });

    it('exporta named function useModalAccessibility', () => {
        expect(hookSrc).toMatch(/export\s+function\s+useModalAccessibility\s*\(/);
    });

    it('hook acepta { isOpen, onClose, disableClose } y retorna { containerRef }', () => {
        expect(hookSrc).toMatch(/function\s+useModalAccessibility\s*\(\s*\{\s*isOpen[\s\S]*?onClose[\s\S]*?disableClose/);
        expect(hookSrc).toMatch(/return\s*\{\s*containerRef\s*\}/);
    });

    it('maneja Escape key y NO cierra si disableClose=true', () => {
        expect(hookSrc).toMatch(/e\.key\s*===\s*['"]Escape['"][\s\S]*?!disableClose[\s\S]*?onClose\(\)/);
    });

    it('implementa focus trap con Tab/Shift+Tab', () => {
        expect(hookSrc).toMatch(/e\.key\s*===\s*['"]Tab['"]/);
        expect(hookSrc).toMatch(/e\.shiftKey/);
        expect(hookSrc).toMatch(/last\.focus\s*\(\s*\)/);
        expect(hookSrc).toMatch(/first\.focus\s*\(\s*\)/);
    });

    it('restaura focus al trigger original al cerrar (cleanup)', () => {
        expect(hookSrc).toMatch(/triggerRef\.current\s*=\s*document\.activeElement/);
        expect(hookSrc).toMatch(/triggerRef\.current\.focus\s*\(\s*\)/);
    });

    it('lock body overflow mientras isOpen', () => {
        expect(hookSrc).toMatch(/document\.body\.style\.overflow\s*=\s*['"]hidden['"]/);
    });

    it('cleanup restaura body overflow original', () => {
        expect(hookSrc).toMatch(/document\.body\.style\.overflow\s*=\s*prevOverflow/);
    });
});


describe('[P2-CUSTOM-MODALS-A11Y] PaymentModal integration', () => {
    it('marker presente en PaymentModal.jsx', () => {
        expect(paymentSrc).toMatch(/\[P2-CUSTOM-MODALS-A11Y\s*·\s*2026-05-24\]/);
    });

    it('importa useModalAccessibility desde hooks', () => {
        expect(paymentSrc).toMatch(
            /import\s*\{\s*useModalAccessibility\s*\}\s*from\s*['"]\.\.\/\.\.\/hooks\/useModalAccessibility['"]/
        );
    });

    it('invoca hook con isOpen + onClose del componente', () => {
        expect(paymentSrc).toMatch(/useModalAccessibility\s*\(\s*\{[\s\S]*?isOpen[\s\S]*?onClose/);
    });

    it('overlay tiene role="dialog" + aria-modal="true" + aria-labelledby', () => {
        expect(paymentSrc).toMatch(/role\s*=\s*["']dialog["']/);
        expect(paymentSrc).toMatch(/aria-modal\s*=\s*["']true["']/);
        expect(paymentSrc).toMatch(/aria-labelledby\s*=\s*["']payment-modal-title["']/);
    });

    it('heading principal tiene id="payment-modal-title"', () => {
        expect(paymentSrc).toMatch(/id\s*=\s*["']payment-modal-title["']/);
    });

    it('overlay tiene tabIndex={-1} para recibir focus programático', () => {
        // Buscamos cerca de role="dialog" → tabIndex={-1}
        const dialogIdx = paymentSrc.indexOf('role="dialog"');
        expect(dialogIdx).toBeGreaterThan(-1);
        const around = paymentSrc.slice(Math.max(0, dialogIdx - 300), dialogIdx + 300);
        expect(around).toMatch(/tabIndex\s*=\s*\{\s*-1\s*\}/);
    });
});


describe('[P2-CUSTOM-MODALS-A11Y] LogoutConfirmModal integration', () => {
    it('marker presente en LogoutConfirmModal.jsx', () => {
        expect(logoutSrc).toMatch(/\[P2-CUSTOM-MODALS-A11Y\s*·\s*2026-05-24\]/);
    });

    it('importa useModalAccessibility', () => {
        expect(logoutSrc).toMatch(
            /import\s*\{\s*useModalAccessibility\s*\}\s*from\s*['"]\.\.\/\.\.\/hooks\/useModalAccessibility['"]/
        );
    });

    it('invoca hook con disableClose=isLoading (logout en progreso bloquea ESC)', () => {
        expect(logoutSrc).toMatch(/disableClose\s*:\s*isLoading/);
    });

    it('card raíz tiene role="dialog" + aria-modal + aria-labelledby="logout-confirm-title"', () => {
        expect(logoutSrc).toMatch(/role\s*=\s*["']dialog["']/);
        expect(logoutSrc).toMatch(/aria-modal\s*=\s*["']true["']/);
        expect(logoutSrc).toMatch(/aria-labelledby\s*=\s*["']logout-confirm-title["']/);
    });

    it('heading tiene id="logout-confirm-title"', () => {
        expect(logoutSrc).toMatch(/id\s*=\s*["']logout-confirm-title["']/);
    });
});


describe('[P2-CUSTOM-MODALS-A11Y] Dashboard restock modal integration', () => {
    it('marker presente en Dashboard.jsx', () => {
        expect(dashboardSrc).toMatch(/\[P2-CUSTOM-MODALS-A11Y\s*·\s*2026-05-24\]/);
    });

    it('importa useModalAccessibility', () => {
        expect(dashboardSrc).toMatch(
            /import\s*\{\s*useModalAccessibility\s*\}\s*from\s*['"]\.\.\/hooks\/useModalAccessibility['"]/
        );
    });

    it('invoca hook con isOpen=showRestockModal + disableClose=isRestocking', () => {
        expect(dashboardSrc).toMatch(/useModalAccessibility\s*\(\s*\{[\s\S]*?isOpen:\s*showRestockModal/);
        expect(dashboardSrc).toMatch(/disableClose\s*:\s*isRestocking/);
    });

    it('modal motion.div root tiene role="dialog" + aria-modal + aria-labelledby', () => {
        // El restock modal inline está cerca del id="restock-modal-title".
        expect(dashboardSrc).toMatch(/aria-labelledby\s*=\s*["']restock-modal-title["']/);
        expect(dashboardSrc).toMatch(/id\s*=\s*["']restock-modal-title["']/);
        // role/aria-modal presentes (search general).
        const restockIdx = dashboardSrc.indexOf('aria-labelledby="restock-modal-title"');
        expect(restockIdx).toBeGreaterThan(-1);
        const around = dashboardSrc.slice(Math.max(0, restockIdx - 400), restockIdx + 400);
        expect(around).toMatch(/role\s*=\s*["']dialog["']/);
        expect(around).toMatch(/aria-modal\s*=\s*["']true["']/);
        expect(around).toMatch(/tabIndex\s*=\s*\{\s*-1\s*\}/);
    });
});


// [P3-DASH-MODALS-A11Y · 2026-05-30] Cobertura de los 2 modales del dashboard
// migrados al hook SSOT en esta pasada del audit del Dashboard:
//   - Modal de Onboarding Push (Dashboard.jsx) — era el único modal del Dashboard
//     sin role/ESC/focus-trap/restore (el restock modal inline ya lo tenía).
//   - "Mobile More Menu" (DashboardLayout.jsx) — overlay full-screen con acción
//     destructiva (Cerrar Sesión) sin las defensas a11y; el popover de cuenta
//     desktop equivalente ya tenía ESC + click-outside.
describe('[P3-DASH-MODALS-A11Y] Push Onboarding modal (Dashboard.jsx)', () => {
    it('marker presente', () => {
        expect(dashboardSrc).toMatch(/\[P3-DASH-MODALS-A11Y\s*·\s*2026-05-30\]/);
    });

    it('invoca useModalAccessibility con isOpen=showPushOnboarding + disableClose=isPushEnabling', () => {
        expect(dashboardSrc).toMatch(/useModalAccessibility\s*\(\s*\{[\s\S]*?isOpen:\s*showPushOnboarding/);
        expect(dashboardSrc).toMatch(/onClose:\s*dismissPushOnboarding/);
        expect(dashboardSrc).toMatch(/disableClose:\s*isPushEnabling/);
    });

    it('modal root tiene role="dialog" + aria-modal + aria-labelledby + tabIndex + ref + heading id', () => {
        expect(dashboardSrc).toMatch(/aria-labelledby\s*=\s*["']push-onboarding-title["']/);
        expect(dashboardSrc).toMatch(/id\s*=\s*["']push-onboarding-title["']/);
        const idx = dashboardSrc.indexOf('aria-labelledby="push-onboarding-title"');
        expect(idx).toBeGreaterThan(-1);
        const around = dashboardSrc.slice(Math.max(0, idx - 400), idx + 400);
        expect(around).toMatch(/role\s*=\s*["']dialog["']/);
        expect(around).toMatch(/aria-modal\s*=\s*["']true["']/);
        expect(around).toMatch(/tabIndex\s*=\s*\{\s*-1\s*\}/);
        expect(around).toMatch(/ref\s*=\s*\{\s*pushOnboardingRef\s*\}/);
    });
});


describe('[P3-DASH-MODALS-A11Y] Mobile More Menu (DashboardLayout.jsx)', () => {
    it('marker presente', () => {
        expect(layoutSrc).toMatch(/\[P3-DASH-MODALS-A11Y\s*·\s*2026-05-30\]/);
    });

    it('importa useModalAccessibility', () => {
        expect(layoutSrc).toMatch(
            /import\s*\{\s*useModalAccessibility\s*\}\s*from\s*['"]\.\.\/\.\.\/hooks\/useModalAccessibility['"]/
        );
    });

    it('invoca el hook con isOpen=isMobileMoreMenuOpen + onClose=closeMoreMenu', () => {
        expect(layoutSrc).toMatch(/useModalAccessibility\s*\(\s*\{[\s\S]*?isOpen:\s*isMobileMoreMenuOpen/);
        expect(layoutSrc).toMatch(/onClose:\s*closeMoreMenu/);
    });

    it('el menú role="menu" tiene ref={moreMenuRef} + tabIndex={-1}', () => {
        const idx = layoutSrc.indexOf('className={styles.mobileMoreMenu}');
        expect(idx).toBeGreaterThan(-1);
        const around = layoutSrc.slice(Math.max(0, idx - 120), idx + 220);
        expect(around).toMatch(/ref\s*=\s*\{\s*moreMenuRef\s*\}/);
        expect(around).toMatch(/tabIndex\s*=\s*\{\s*-1\s*\}/);
    });
});
