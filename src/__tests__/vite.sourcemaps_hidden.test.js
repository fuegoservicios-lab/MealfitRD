// [P2-SOURCEMAPS-HIDDEN · 2026-07-30] Sin sourcemaps, NINGÚN error de frontend
// se puede leer en Sentry: llegan como `t.default` dentro de una función `Ln`.
// El caso que lo motivó fue un `TypeError: Cannot read properties of undefined
// (reading 'default')` en /login que costó una hora de análisis estático y
// quedó SIN cerrar precisamente por no tener stack trace legible.
//
// La decisión tiene DOS mitades y ninguna sirve sola:
//
//   1. `sourcemap: 'hidden'` — genera los `.map` pero NO escribe el comentario
//      `//# sourceMappingURL=`, así que ningún navegador los pide.
//   2. El deploy los sube a Sentry y **los borra de `dist/`**, porque nginx
//      sirve ese directorio: un `.map` que sobreviva queda PÚBLICO y expone el
//      fuente con nombres y comentarios originales — y en este repo los
//      comentarios llevan razonamiento de negocio (umbrales, incidentes,
//      decisiones de producto). Más nginx denegando `*.map` como 2ª barrera.
//
// Por qué NO se eligió `sourcemap: true` + "JavaScript source fetching" de
// Sentry (que ya está activado y habría funcionado sin token ni subida): esa
// vía exige servir los `.map` públicamente. Es un intercambio real —
// conveniencia contra publicar el fuente— y se resolvió a favor de la
// privacidad, aceptando el coste de necesitar un `SENTRY_AUTH_TOKEN`.
//
// Este test ancla las dos mitades: si alguien pone `true` (fuente público) o
// quita el borrado del deploy (fuente público por otra vía), falla.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _viteCfg = readFileSync(join(__dirname, '..', '..', 'vite.config.js'), 'utf-8');

// `deploy-mealfit.ps1` vive en la RAÍZ DEL WORKSPACE, fuera de este repo (el
// frontend es un repo hermano). Quien clone solo el frontend no lo tiene, así
// que leerlo a pelo reventaría el fichero de test entero al importarlo.
// Se salta de forma VISIBLE en vez de pasar en vacío: un test verde que no
// comprobó nada es peor que uno saltado, porque nadie vuelve a mirarlo.
const _deployPath = join(__dirname, '..', '..', '..', 'deploy-mealfit.ps1');
const _hasDeploy = existsSync(_deployPath);
const _deploy = _hasDeploy ? readFileSync(_deployPath, 'utf-8') : '';
const describeDeploy = _hasDeploy ? describe : describe.skip;

describe('P2-SOURCEMAPS-HIDDEN · generación', () => {
    it('el build genera sourcemaps', () => {
        expect(_viteCfg).toMatch(/sourcemap:\s*['"]hidden['"]/);
    });

    it("es 'hidden', NUNCA true — `true` publica el enlace en el bundle", () => {
        // Con `true` Vite escribe `//# sourceMappingURL=` y el navegador pide el
        // .map: el fuente queda expuesto a cualquiera que abra DevTools.
        expect(_viteCfg).not.toMatch(/sourcemap:\s*true/);
    });
});

describeDeploy('P2-SOURCEMAPS-HIDDEN · los .map no pueden quedar públicos', () => {
    it('sanity: el script de deploy se leyó de verdad', () => {
        // Sin esto, un fichero vacío haría que los `toMatch` de abajo fueran los
        // únicos en fallar y no se distinguiría "regresión" de "no lo encontré".
        expect(_deploy.length).toBeGreaterThan(500);
        expect(_deploy).toContain('Deploy-Frontend');
    });

    it('el deploy los BORRA de dist', () => {
        expect(_deploy).toMatch(/rm -f dist\/assets\/\*\.map/);
    });

    it('el borrado ocurre AUNQUE falte el token de Sentry', () => {
        // El `rm` vive fuera del `if [ -n "$TOK" ]`. Si estuviera dentro, un
        // deploy sin token dejaría el fuente publicado — que es peor que
        // quedarse sin des-minificar.
        const i = _deploy.indexOf('rm -f dist/assets/*.map');
        const j = _deploy.lastIndexOf('else', i);
        const k = _deploy.lastIndexOf('fi', i);
        expect(i).toBeGreaterThan(-1);
        expect(k).toBeGreaterThan(j); // el `fi` cierra el if ANTES del rm
    });

    it('el deploy ABORTA si algún .map sobrevive', () => {
        // Verificación post-hoc: no basta con ejecutar el `rm`, hay que
        // comprobar que surtió efecto. Un `rm` que falla en silencio deja el
        // fuente público y el deploy diría OK.
        expect(_deploy).toMatch(/QUEDAN .*sourcemaps en dist/);
    });

    it('la subida a Sentry apunta a la org y proyecto correctos', () => {
        expect(_deploy).toContain('--org bioboros-ih');
        expect(_deploy).toContain('--project bioboros-frontend');
    });
});
