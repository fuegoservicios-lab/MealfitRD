/**
 * [P3-I18N-MANIFIESTOS-POR-IDIOMA-AUSENTES-DEL-BUILD-NATIVO · 2026-08-23] npm sólo encadena
 * `postbuild` al script llamado `build`. `build:native` es `vite build --mode native`, así
 * que el bundle que `cap sync` copia a iOS nacía SIN `manifest.<locale>.json`, y el boot de
 * `index.html` —que cambia el `href` del manifiesto cuando el idioma no es es-DO— apuntaba a
 * un fichero que no estaba empaquetado: un 404 en cada arranque en frío en otro idioma.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('[P3-I18N-MANIFIESTOS-POR-IDIOMA-AUSENTES-DEL-BUILD-NATIVO]', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));

    it('build:native genera los manifiestos por idioma', () => {
        expect(pkg.scripts['build:native']).toMatch(/vite build --mode native/);
        expect(pkg.scripts['build:native'], 'el bundle nativo nace sin manifest.<locale>.json')
            .toMatch(/node scripts\/build-manifests-i18n\.mjs/);
    });

    it('el build web sigue generándolos por postbuild (no se duplica el paso)', () => {
        expect(pkg.scripts.postbuild).toMatch(/build-manifests-i18n\.mjs/);
        expect(pkg.scripts.build).toBe('vite build');
    });

    it('el generador escribe en dist/ cuando existe (lo que cap sync copia)', () => {
        const src = readFileSync(resolve(__dirname, '../../scripts/build-manifests-i18n.mjs'), 'utf8');
        expect(src).toMatch(/existsSync\(join\(RAIZ, 'dist'\)\) \? join\(RAIZ, 'dist'\)/);
    });
});
