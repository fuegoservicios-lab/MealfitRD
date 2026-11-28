/**
 * [P1-IOS-UPGRADE-SAFE-AREA · 2026-11-27] En iOS nativo (`contentInset: 'never'`),
 * la cabecera de Upgrade (`/dashboard/upgrade`) chocaba con la hora/barra de estado.
 * Este contrato asegura que `.stickyHeader` reserva `env(safe-area-inset-top)` después
 * del shorthand `padding` y `.root` reserva `env(safe-area-inset-bottom)`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../pages/Upgrade.module.css'), 'utf-8');

function rule(selector) {
    const idx = css.indexOf(`${selector} {`);
    expect(idx, `no existe la regla ${selector}`).toBeGreaterThan(-1);
    return css.slice(idx, css.indexOf('}', idx));
}

describe('[P1-IOS-UPGRADE-SAFE-AREA] cabecera y pie de Upgrade respetan el notch', () => {
    it('.stickyHeader reserva env(safe-area-inset-top) después del padding corto', () => {
        const r = rule('.stickyHeader');
        const corto = r.search(/\n\s*padding:\s/);
        const largo = r.search(/\n\s*padding-top:\s*calc\([^;]*env\(safe-area-inset-top/);
        expect(corto).toBeGreaterThan(-1);
        expect(largo).toBeGreaterThan(corto);
    });

    it('.root reserva env(safe-area-inset-bottom) abajo', () => {
        const r = rule('.root');
        expect(r).toMatch(/env\(safe-area-inset-bottom/);
    });
});
