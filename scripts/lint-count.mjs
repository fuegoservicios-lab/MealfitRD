// [P1-CI-GATE-PASSABLE · 2026-08-14] Imprime el conteo de eslint de HOY.
//
// Por qué existe. `ci.yml` gatea con `--max-warnings <N>`, un número congelado a
// mano. El 2026-07-12 se congeló en 148 con el comentario «Tope = estado
// actual»; cuando el lockfile subió `eslint-plugin-react-hooks` a 7.0.1, la
// regla nueva `set-state-in-effect` aportó 16 warnings sobre código que nadie
// había tocado y el job quedó rojo. Estuvo rojo sin que nadie lo notara, porque
// un gate binario sólo dice «pasa / no pasa»: nunca dice CUÁNTO te falta ni
// hacia dónde te estás moviendo.
//
// Esto no es un gate — no falla nunca a propósito. Es el número, en el log del
// job y a un comando de distancia en local, para que la deriva se vea antes de
// convertirse en un rojo permanente.
//
// Usa la API de Node de ESLint en vez de `npx eslint -f json`: un subproceso
// mezcla en stdout las notas de Babel sobre ficheros grandes (Dashboard.jsx pasa
// de 500 kB) y en Windows `npx.cmd` sin shell no siempre resuelve. La API
// devuelve los objetos directamente y no hay nada que parsear.
//
// Uso: npm run lint:count
import { ESLint } from 'eslint';

const CEILING = 163; // sincronizado a mano con ci.yml; el desajuste se avisa abajo

const eslint = new ESLint({ errorOnUnmatchedPattern: false });
const report = await eslint.lintFiles(['.']);

const warnings = report.reduce((a, f) => a + f.warningCount, 0);
const errors = report.reduce((a, f) => a + f.errorCount, 0);

const porRegla = {};
for (const f of report) {
    for (const m of f.messages) {
        const k = m.ruleId || '(directiva eslint-disable huérfana)';
        porRegla[k] = (porRegla[k] || 0) + 1;
    }
}

console.log(`[lint:count] ${errors} errores · ${warnings} warnings · techo de ci.yml: ${CEILING}`);
for (const [regla, n] of Object.entries(porRegla).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`             ${String(n).padStart(4)}  ${regla}`);
}

if (warnings > CEILING) {
    console.log(
        `[lint:count] ⚠️  ${warnings - CEILING} por ENCIMA del techo: el job \`quality\` de CI falla.\n`
        + '             Si el delta viene de código nuevo, arregla el código.\n'
        + '             Si viene de una regla nueva (bump de plugin), recalibra el techo\n'
        + '             en ci.yml Y aquí, escribiendo la causa como están escritas las anteriores.',
    );
} else if (warnings < CEILING) {
    console.log(
        `[lint:count] ✓ ${CEILING - warnings} de margen. Bajar el techo a ${warnings} lo convierte\n`
        + '             en trinquete y evita que el margen se rellene sin que nadie lo vea.',
    );
}
