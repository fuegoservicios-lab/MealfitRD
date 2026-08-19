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
// Sin argumentos NO es un gate: solo imprime, para que la deriva se vea antes de
// convertirse en un rojo permanente. Con `--gate` sí falla, pero por el techo POR
// REGLA de más abajo, no por el total —ese sigue siendo informativo—.
//
// [P2-LINT-RATCHET-POR-REGLA · 2026-08-18] Este párrafo decía «no falla nunca a
// propósito» y se quedó así al añadir `--gate`. Un comentario que contradice al
// código es peor que ninguno: el siguiente que lea esto decidirá en falso.
//
// Usa la API de Node de ESLint en vez de `npx eslint -f json`: un subproceso
// mezcla en stdout las notas de Babel sobre ficheros grandes (Dashboard.jsx pasa
// de 500 kB) y en Windows `npx.cmd` sin shell no siempre resuelve. La API
// devuelve los objetos directamente y no hay nada que parsear.
//
// Uso: npm run lint:count
import { ESLint } from 'eslint';

const CEILING = 66; // sincronizado a mano con ci.yml; el desajuste se avisa abajo

/**
 * [P2-LINT-RATCHET-POR-REGLA · 2026-08-18] Un techo global tiene un agujero:
 * es FUNGIBLE. Con 158 de tope, arreglar un aviso de `localStorage` libera un
 * hueco por el que entra, sin que nadie lo vea, un `exhaustive-deps` nuevo —y
 * esos dos no valen lo mismo ni de lejos: uno es estilo, el otro es un bucle de
 * render esperando su turno—. El número se queda igual y la salud empeora.
 *
 * Con techo POR REGLA eso deja de compensarse solo. Y una regla que hoy no
 * aparece tiene techo 0: si un bump de plugin trae una regla nueva, sale a la
 * cara en vez de esconderse bajo el margen de las demás —que es exactamente lo
 * que pasó cuando `react-hooks@7` añadió `set-state-in-effect` y dejó el job
 * rojo durante semanas sin que nadie supiera por qué—.
 *
 * MEDIDO al fijarlos (2026-08-18): de los 92 `no-restricted-syntax`, los 92
 * están YA dentro de un `try/catch` —comprobado contando llaves, no con una
 * ventana de líneas—. O sea que no son 92 caidas latentes: son 92 copias de la
 * misma guarda. Bajarlos a cero es consolidar en `safeLocalStorage`, un trabajo
 * de valor real pero MECÁNICO y ancho; hacerlo a ciegas y de una tacada es
 * cambiar deuda contabilizada por riesgo sin contabilizar.
 */
const TECHOS_POR_REGLA = {
    // [P2-LOCALSTORAGE-SSOT · 2026-08-19] CERRADA. Eran 92 sitios en 22 ficheros,
    // todos consolidados en `safeLocalStorage`. Techo 0: cualquier `localStorage`
    // crudo que vuelva sale a la cara.
    //
    // No era deuda de seguridad —los 92 ya estaban dentro de un `try/catch`— sino
    // de SSOT, y aun asi el cierre encontro tres cosas que un barrido ciego habria
    // roto: tres escrituras de `secureFormStorage` cuyo `catch` REGISTRABA el fallo
    // (migradas con el `onError` del envoltorio, que existe justo para eso), una
    // que ademas decidia no borrar el blob cifrado previo (se relanza para
    // conservar UN solo manejador), y cinco anclas de guards que citaban el literal
    // `localStorage.setItem(...)` como prueba de que el espejo se escribia.
    'no-restricted-syntax': 0,
    // Ficheros que exportan algo que no es un componente junto al componente.
    // Rompe el refresco en caliente del desarrollo; no afecta a producción.
    'react-refresh/only-export-components': 26,
    // ⚠ EL BLOQUE QUE NO SE TOCA A CIEGAS. Cada uno pide leer el efecto: añadir
    // la dependencia que falta puede ser justo lo que provoque el bucle infinito
    // que el autor evitó omitiéndola. Se arreglan de uno en uno y con la pantalla
    // delante, nunca en barrido.
    'react-hooks/exhaustive-deps': 24,
    // Idem: regla del compilador de React, llegada en el bump a la 7.
    'react-hooks/set-state-in-effect': 16,
};

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

// --- trinquete por regla -----------------------------------------------------
const GATE = process.argv.includes('--gate');
const excesos = [];
for (const [regla, n] of Object.entries(porRegla)) {
    const techo = TECHOS_POR_REGLA[regla] ?? 0;
    if (n > techo) excesos.push({ regla, n, techo });
}
const margenes = Object.entries(TECHOS_POR_REGLA)
    .filter(([r, techo]) => (porRegla[r] || 0) < techo)
    .map(([r, techo]) => ({ regla: r, n: porRegla[r] || 0, techo }));

if (excesos.length) {
    console.log('[lint:count] ❌ por ENCIMA del techo de su regla:');
    for (const e of excesos) {
        console.log(`             ${e.regla}: ${e.n} > ${e.techo}`
            + (e.techo === 0 ? '   ← REGLA NUEVA (bump de plugin?)' : ''));
    }
    console.log('             Arregla el código, o sube el techo DE ESA REGLA escribiendo por qué.');
}
if (margenes.length) {
    console.log('[lint:count] ✓ margen que conviene cerrar (bajar el techo lo hace trinquete):');
    for (const m of margenes) console.log(`             ${m.regla}: ${m.n} < ${m.techo}`);
}
if (GATE && excesos.length) process.exit(1);

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
