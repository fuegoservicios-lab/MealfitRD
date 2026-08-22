/**
 * [P1-SETTINGS-SAFE-AREA-TOP · 2026-08-22] En el iPhone (build 8) la cabecera de
 * Configuración —título y la X de cerrar— quedaba DEBAJO del reloj y la batería. Desde
 * `contentInset: 'never'` (P1-IOS-WEBVIEW-SCROLL) el documento empieza en el borde físico
 * y cada cabecera reserva su propio hueco de notch; la del dashboard ya lo hacía
 * (`max(env(safe-area-inset-top), 6px)`), la de Configuración no: usaba un relleno fijo.
 *
 * Contrato: la fila de chrome del diálogo suma `env(safe-area-inset-top)` a su relleno
 * superior. En web/Android sin notch el inset es 0 y nada cambia.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.resolve(__dirname, '../pages/Settings.module.css'), 'utf-8');

function rule(selector) {
    const i = css.indexOf(`\n${selector} {`);
    expect(i, `no existe la regla ${selector}`).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
}

describe('[P1-SETTINGS-SAFE-AREA-TOP] el cajón del diario (fixed desde el borde) también reserva el notch', () => {
    it('.drawer de DiaryHistory lleva padding-top con env(safe-area-inset-top)', () => {
        const diario = fs.readFileSync(path.resolve(__dirname, '../components/dashboard/DiaryHistory.module.css'), 'utf-8');
        const i = diario.indexOf('\n.drawer {');
        expect(i).toBeGreaterThan(-1);
        const r = diario.slice(i, diario.indexOf('}', i));
        expect(r).toMatch(/padding-top:\s*env\(safe-area-inset-top(,\s*0px)?\)/);
    });
});

describe('[P1-SETTINGS-SAFE-AREA-TOP] la cabecera de Configuración respeta la barra de estado', () => {
    it('.inDialog .headerRow reserva env(safe-area-inset-top) arriba', () => {
        const r = rule('.inDialog .headerRow');
        expect(r).toMatch(/padding-top:\s*calc\([^;]*env\(safe-area-inset-top(,\s*0px)?\)[^;]*\)/);
    });

    it('la reserva va DESPUÉS del padding corto (si no, la shorthand la pisa)', () => {
        const r = rule('.inDialog .headerRow');
        const corto = r.search(/\n\s*padding:\s/);
        const largo = r.search(/\n\s*padding-top:\s/);
        expect(corto).toBeGreaterThan(-1);
        expect(largo).toBeGreaterThan(corto);
    });
});
