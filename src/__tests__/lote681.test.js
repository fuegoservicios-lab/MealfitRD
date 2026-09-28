/**
 * [P1-PLAN-LOTE-681] La OTA nativa y la sonda del teclado salen de la carga inicial de la web.
 *
 * La OTA se gatea en BUILD (`import.meta.env.MODE === 'native'`), no en ejecución: eso sólo es
 * seguro mientras los DOS binarios nativos compilen con `--mode native`. Si alguien cambia el
 * modo de uno de ellos, la app dejaría de confirmar su paquete y el plugin volvería atrás (y
 * vetaría ese paquete para siempre en el teléfono). Este test ancla esa precondición.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(__dirname, '..', '..');
const leer = (rel) => readFileSync(join(raiz, rel), 'utf8');

describe('lote 681: arranque de la web sin OTA ni sonda', () => {
    it('main.jsx llama a la OTA sólo en builds nativos, antes del render', () => {
        const main = leer('src/main.jsx');
        const llamada = "if (import.meta.env.MODE === 'native') iniciarOtaNativa()";
        expect(main).toContain(llamada);
        expect(main.indexOf(llamada)).toBeLessThan(main.indexOf("createRoot(document.getElementById('root')).render("));
    });

    it('los dos binarios nativos compilan con --mode native (precondición del gate)', () => {
        const pkg = JSON.parse(leer('package.json'));
        expect(pkg.scripts['build:native']).toMatch(/vite build --mode native/);
        expect(leer('scripts/build-ota-bundle.mjs')).toMatch(/'build', '--mode', 'native'/);
        // …y fuera de native el id del paquete es '', que es lo que hacía de la llamada un no-op en la web.
        expect(leer('vite.config.js')).toMatch(/__OTA_BUNDLE_ID__: JSON\.stringify\(mode === 'native' \?/);
    });

    it('la sonda del teclado se carga diferida, sin gate propio en main.jsx', () => {
        const main = leer('src/main.jsx');
        expect(main).not.toMatch(/^import [^\n]*from '\.\/utils\/keyboardProbe'/m);
        expect(main).toContain("import('./utils/keyboardProbe').then((m) => m.iniciarSondaTeclado())");
    });
});
