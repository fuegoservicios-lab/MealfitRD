// [P2-ICON-CLOSE-UNIFORM · 2026-09-02] Un solo botón de cierre («X») en toda la app.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

const SITIOS = [
    'src/components/agent/AttachmentSourceSheet.jsx',
    'src/components/common/CameraViewfinder.jsx',
    'src/components/common/Modal.jsx',
    'src/components/dashboard/DiaryHistory.jsx',
    'src/components/dashboard/HelpChatWidget.jsx',
    'src/components/dashboard/LogMealModal.jsx',
    'src/components/dashboard/NotificationCenter.jsx',
    'src/components/dashboard/PaymentModal.jsx',
    'src/components/dashboard/RestockNudge.jsx',
    'src/components/dashboard/ScanMealModal.jsx',
    'src/components/IOSInstallPrompt.jsx',
    'src/components/layout/Header.jsx',
    'src/pages/Dashboard.jsx',
    'src/pages/History.jsx',
    'src/pages/Settings.jsx',
    'src/pages/SupermarketPage.jsx',
];

describe('ui-close: cierre uniforme', () => {
    it('la clase de sistema existe: tinte al hover, foco visible, sin sombra de CTA', () => {
        const css = read('src/index.css');
        expect(css).toContain('button.ui-close {');
        expect(css).toContain('button.ui-close:hover:not(:disabled) {');
        expect(css).toContain('button.ui-close:focus-visible {');
        const h = css.indexOf('button.ui-close:hover:not(:disabled) {');
        expect(css.slice(h, h + 400)).toContain('box-shadow: none !important');
        expect(css.slice(h, h + 400)).toContain('color-mix(in srgb, var(--text-main');
        expect(css).toContain('@media (pointer: coarse)');
    });
    for (const f of SITIOS) {
        it(`${f}: cada X de cierre lleva ui-close y el icono uniforme`, () => {
            const src = read(f);
            const marks = src.match(/ui-close/g) || [];
            expect(marks.length).toBeGreaterThan(0);
            // cada botón ui-close pinta el icono normalizado
            const iconos = src.match(/<X size=\{20\} strokeWidth=\{2\.25\} aria-hidden="true" \/>/g) || [];
            expect(iconos.length).toBeGreaterThanOrEqual(marks.length);
        });
    }
    it('Dashboard: los 5 avisos descartables usan el mismo cierre', () => {
        const src = read('src/pages/Dashboard.jsx');
        expect((src.match(/ui-close/g) || []).length).toBe(5);
    });
});
