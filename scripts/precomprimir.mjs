/**
 * [P3-BROTLI · 2026-08-19] Pre-comprime `dist/` con brotli de máxima calidad.
 *
 * POR QUÉ, con el número delante. El VPS ya sirve brotli dinámico, y medido
 * sobre el cable el ahorro fue **4,0% (8,9 kB)** frente a gzip. La medición
 * offline con calidad 11 daba **14,1%**. La diferencia no es ruido: comprimir en
 * cada petición obliga a usar una calidad baja —aquí, 5— porque el coste lo paga
 * el servidor en cada visita.
 *
 * Pre-comprimir mueve ese coste al build, donde se paga UNA vez por release y
 * nadie está esperando. `brotli_static on` sirve el `.br` de al lado si existe;
 * si no, cae al brotli dinámico, que sigue configurado. O sea: esto no es un
 * punto de fallo nuevo — es un atajo que el servidor toma cuando puede.
 *
 * QUÉ NO COMPRIME, y por qué:
 *   · Nada por debajo de 1.024 B, el mismo umbral que `brotli_min_length` del
 *     servidor. Comprimir 200 B ahorra decenas de bytes y añade un fichero.
 *   · Nada que ya venga comprimido (imágenes, fuentes woff2): el resultado sale
 *     igual o MÁS grande, y un `.br` más grande que su original es un fichero
 *     que el servidor elegiría por error.
 *   · Nada donde el ahorro no llegue al 5%: si comprimir no vale la pena, el
 *     fichero no se escribe. Es la misma regla que aplica el propio nginx.
 *
 * Los `.map` no llegan aquí: el deploy los sube a Sentry y los borra de `dist`
 * antes de publicar.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(AQUI, '..', 'dist');

/** Lo que se comprime. Texto, y solo texto. */
const COMPRIMIBLES = /\.(js|css|html|json|svg|xml|txt|webmanifest)$/i;

const MINIMO_BYTES = 1024;   // el mismo umbral que `brotli_min_length` en nginx
const AHORRO_MINIMO = 0.05;  // por debajo de esto, el fichero extra no compensa

function* ficheros(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* ficheros(p);
        else yield p;
    }
}

let escritos = 0, saltados = 0, crudo = 0, comprimido = 0;

for (const f of ficheros(DIST)) {
    if (!COMPRIMIBLES.test(f) || f.endsWith('.br')) continue;
    const tam = statSync(f).size;
    if (tam < MINIMO_BYTES) { saltados++; continue; }

    const buf = readFileSync(f);
    const br = brotliCompressSync(buf, {
        params: {
            [constants.BROTLI_PARAM_QUALITY]: 11,
            [constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
        },
    });

    if (br.length >= buf.length * (1 - AHORRO_MINIMO)) { saltados++; continue; }

    writeFileSync(f + '.br', br);
    escritos++; crudo += buf.length; comprimido += br.length;
}

const pct = crudo ? ((1 - comprimido / crudo) * 100).toFixed(1) : '0.0';
console.log(
    `[precomprimir] ${escritos} ficheros .br (${saltados} saltados por pequeños o incompresibles) · `
    + `${(crudo / 1024).toFixed(0)} kB -> ${(comprimido / 1024).toFixed(0)} kB (${pct}% menos que el original)`
);
