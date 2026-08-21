/**
 * [P1-IOS-NATIVE-SHELL · 2026-08-21] Contrato de la app nativa (App Store):
 * en nativo NO existe comercio (Apple 3.1.1 / 3.1.3(b)) — ni precios, ni «Mejorar plan»,
 * ni PayPal, ni landing. Un solo gate (`config/platform.js`) y seis superficies que lo
 * consumen. Spec: docs/superpowers/specs/2026-08-21-ios-native-shell-design.md
 *
 * Dos capas:
 *   A. Render con el gate mockeado en AMBOS sentidos (la mitad «false» evita que el gate
 *      esconda el comercio también en la web — eso sería un bug en silencio).
 *   B. Parser-based sobre el fuente: cada superficie IMPORTA el gate y lo aplica donde
 *      toca. Un renombre o un «limpiar import sin uso» lo tumba.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen } from './utils/test-utils';

vi.mock('../config/platform', () => ({
    isNativeApp: vi.fn(() => false),
    nativeHidesCommerce: vi.fn(() => false),
    appleSignInEnabled: vi.fn(() => false),
}));
vi.mock('@paypal/react-paypal-js', () => ({
    PayPalScriptProvider: ({ children }) => <>{children}</>,
    PayPalButtons: () => <div data-testid="paypal-buttons" />,
    FUNDING: { PAYPAL: 'paypal', CARD: 'card' },
}));

import * as platform from '../config/platform';
import AccountMenu from '../components/dashboard/AccountMenu';
import PaymentModal from '../components/dashboard/PaymentModal';

const SRC = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf-8');

beforeEach(() => {
    platform.nativeHidesCommerce.mockReturnValue(false);
    platform.appleSignInEnabled.mockReturnValue(false);
});

describe('[P1-IOS-NATIVE-SHELL] A. render — el comercio desaparece en nativo y sigue en web', () => {
    it('AccountMenu: sin handler onViewPlans no hay CTA de planes (viewPlansLabel=null NO bastaba: el ?? lo rellenaba)', () => {
        render(<AccountMenu user={{ name: 'a', email: 'a@b.c' }} viewPlansLabel={null} onLogout={() => {}} />);
        expect(screen.queryByText('Ver planes')).toBeNull();
        expect(screen.queryByText('Mejorar plan')).toBeNull();
    });

    it('AccountMenu: con handler (web) el CTA se pinta como siempre', () => {
        render(<AccountMenu user={{ name: 'a', email: 'a@b.c' }} viewPlansLabel="Mejorar plan" onViewPlans={() => {}} onLogout={() => {}} />);
        expect(screen.getByText('Mejorar plan')).toBeTruthy();
    });

    it('PaymentModal: abierto en nativo devuelve null (defensa en profundidad)', () => {
        platform.nativeHidesCommerce.mockReturnValue(true);
        const { container } = render(
            <PaymentModal isOpen onClose={() => {}} selectedPlan={{ id: 'basic', name: 'Básico', price: 9.99 }} />
        );
        expect(container.innerHTML).toBe('');
        expect(screen.queryByTestId('paypal-buttons')).toBeNull();
    });

    it('PaymentModal: abierto en web SÍ pinta (el gate no esconde el comercio a los usuarios web)', () => {
        const { container } = render(
            <PaymentModal isOpen onClose={() => {}} selectedPlan={{ id: 'basic', name: 'Básico', price: 9.99 }} />
        );
        expect(container.innerHTML).not.toBe('');
    });
});

describe('[P1-IOS-NATIVE-SHELL] B. parser — cada superficie consume el ÚNICO gate', () => {
    it('platform.js es el único sitio que pregunta a Capacitor', () => {
        const files = [];
        const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/__tests__|node_modules/.test(e.name)) walk(p); }
            else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
        });
        walk(SRC);
        const offenders = files.filter((f) => /isNativePlatform|@capacitor\/core/.test(fs.readFileSync(f, 'utf-8')))
            .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));
        expect(offenders).toEqual(['config/platform.js']);
    });

    it('App.jsx: landing, /precios y /dashboard/upgrade colapsan a /dashboard bajo NATIVE_NO_COMMERCE', () => {
        const src = read('App.jsx');
        expect(src).toMatch(/import \{ nativeHidesCommerce \} from '\.\/config\/platform'/);
        expect(src).toMatch(/const NATIVE_NO_COMMERCE = nativeHidesCommerce\(\)/);
        expect(src).toMatch(/\(IS_APP_HOST \|\| NATIVE_NO_COMMERCE\)\s*\?\s*<Navigate to="\/dashboard" replace \/>/);
        expect(src).toMatch(/path="\/dashboard\/upgrade" element=\{\s*NATIVE_NO_COMMERCE\s*\?\s*<Navigate to="\/dashboard" replace \/>/);
        expect(src).toMatch(/path="\/precios" element=\{\s*NATIVE_NO_COMMERCE\s*\?\s*<Navigate to="\/dashboard" replace \/>/);
    });

    it('DashboardLayout: candado del nav, label y handlers del AccountMenu pasan por el gate', () => {
        const src = read('components/dashboard/DashboardLayout.jsx');
        expect(src).toMatch(/import \{ nativeHidesCommerce \} from '\.\.\/\.\.\/config\/platform'/);
        expect(src).toMatch(/to=\{nativeHidesCommerce\(\) \? '\/dashboard' : '\/dashboard\/upgrade'\}/);
        expect(src).toMatch(/viewPlansLabel=\{nativeHidesCommerce\(\) \? null/);
        expect(src).toMatch(/onViewPlans=\{nativeHidesCommerce\(\) \? undefined/);
        expect(src).toMatch(/onViewPlansHover=\{nativeHidesCommerce\(\) \? undefined/);
    });

    it('AccountMenu: el botón de planes está condicionado a la EXISTENCIA del handler', () => {
        const src = read('components/dashboard/AccountMenu.jsx');
        expect(src).toMatch(/\{typeof onViewPlans === 'function' && \(/);
    });

    it('Settings: «Suscripción» sale del registro de secciones en nativo (ids Y config)', () => {
        const src = read('pages/Settings.jsx');
        expect(src).toMatch(/import \{ nativeHidesCommerce \} from '\.\.\/config\/platform'/);
        expect(src).toMatch(/\.\.\.\(nativeHidesCommerce\(\) \? \[\] : \['subscription'\]\)/);
        expect(src).toMatch(/\]\.filter\(s => SECTION_IDS\.includes\(s\.id\)\)/);
    });

    it('PaymentModal: el early-return incluye el gate y va tras los hooks', () => {
        const src = read('components/dashboard/PaymentModal.jsx');
        expect(src).toMatch(/if \(!isOpen \|\| nativeHidesCommerce\(\)\) return null;/);
        const hooksEnd = src.lastIndexOf('useModalAccessibility(');
        expect(src.indexOf('nativeHidesCommerce()) return null')).toBeGreaterThan(hooksEnd);
    });

    it('Login: Sign in with Apple existe, gateado por appleSignInEnabled, con su clave en los 4 catálogos', () => {
        const src = read('pages/Login.jsx');
        expect(src).toMatch(/appleSignInEnabled\(\) && \(/);
        expect(src).toMatch(/handleOAuth\('apple'\)/);
        expect(src).toContain("t('Continuar con Apple')");
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`i18n/locales/${loc}.json`));
            expect(cat['Continuar con Apple'], loc).toBeTruthy();
        }
    });
});
