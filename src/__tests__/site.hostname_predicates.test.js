// [P1-HOSTNAME-PREDICATES · 2026-07-30] El dominio vivía dentro de CUATRO regex
// con el punto escapado: `/^(www\.)?mealfitrd\.com$/i`. Al migrar a
// bioboros.com, buscar el literal `mealfitrd.com` NO los encontraba —el
// backslash rompe la coincidencia— así que la verificación del cutover dio
// VERDE EN FALSO y los cuatro siguieron comparando contra el dominio viejo.
//
// En producción eso significaba, entre otras cosas, que `IS_APEX_HOST` era
// `false` en bioboros.com y el redirect apex→app NUNCA disparaba: el owner
// estaba usando `bioboros.com/dashboard` cuando debía estar en
// `app.bioboros.com/dashboard`. Los otros tres decidían la sesión en el apex y
// cómo abren los enlaces legales y de "más información".
//
// El fix no es cambiar las cuatro regex: es QUITAR las regex. Comparando
// strings no hay nada que escapar, así que la clase de fallo desaparece en vez
// de quedar arreglada una vez. Este test ancla las dos mitades:
//   1. los predicados se comportan bien (incluida la distinción apex vs subdominio)
//   2. NADIE vuelve a escribir el dominio dentro de un regex escapado

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isApexHost, isSiteHost, SITE_DOMAIN, APEX_ORIGIN, APP_ORIGIN } from '../config/site.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..');

describe('P1-HOSTNAME-PREDICATES · isApexHost', () => {
    it('acepta el apex y www', () => {
        expect(isApexHost('bioboros.com')).toBe(true);
        expect(isApexHost('www.bioboros.com')).toBe(true);
    });

    it('RECHAZA el subdominio de la app — es la distinción que da sentido al predicado', () => {
        // Si `app.` pasara como apex, el redirect apex→app entraría en bucle.
        expect(isApexHost('app.bioboros.com')).toBe(false);
    });

    it('rechaza dominios ajenos, incluido el que nos SUFIJA', () => {
        expect(isApexHost('mealfitrd.com')).toBe(false);
        expect(isApexHost('localhost')).toBe(false);
        // `notbioboros.com` termina en el dominio como SUBCADENA pero no es
        // nuestro — el bug clásico de comparar con `endsWith` a secas.
        expect(isApexHost('notbioboros.com')).toBe(false);
    });

    it('es insensible a mayúsculas (los hostnames lo son)', () => {
        expect(isApexHost('BioBoros.COM')).toBe(true);
    });
});

describe('P1-HOSTNAME-PREDICATES · isSiteHost', () => {
    it('acepta apex, www y cualquier subdominio nuestro', () => {
        expect(isSiteHost('bioboros.com')).toBe(true);
        expect(isSiteHost('www.bioboros.com')).toBe(true);
        expect(isSiteHost('app.bioboros.com')).toBe(true);
    });

    it('rechaza un dominio que solo TERMINA parecido', () => {
        // Sin el punto en `.${SITE_DOMAIN}` esto pasaría: es el motivo de que
        // el predicado no sea un `endsWith(SITE_DOMAIN)` pelado.
        expect(isSiteHost('notbioboros.com')).toBe(false);
        expect(isSiteHost('mealfitrd.com')).toBe(false);
    });
});

describe('P1-HOSTNAME-PREDICATES · SSOT del dominio', () => {
    it('los orígenes derivan de SITE_DOMAIN', () => {
        expect(APEX_ORIGIN).toBe(`https://${SITE_DOMAIN}`);
        expect(APP_ORIGIN).toBe(`https://app.${SITE_DOMAIN}`);
    });
});

describe('P1-HOSTNAME-PREDICATES · el dominio NO vuelve a un regex escapado', () => {
    function walk(dir, acc = []) {
        for (const name of readdirSync(dir)) {
            if (name === 'node_modules' || name === '__tests__') continue;
            const full = join(dir, name);
            if (statSync(full).isDirectory()) walk(full, acc);
            else if (/\.(js|jsx)$/.test(name)) acc.push(full);
        }
        return acc;
    }

    it('cero literales `<dominio>\\.` en src (la forma que un grep de texto NO ve)', () => {
        const files = walk(SRC);
        // Sanity del vehículo: si el walk no encontrara nada, el assert de
        // abajo pasaría en vacío y este test no protegería nada.
        expect(files.length).toBeGreaterThan(100);

        // Se prohíbe la FORMA (dominio con el punto escapado), no un dominio
        // concreto: si mañana se migra otra vez, este test sigue sirviendo.
        const BAD = /[a-z0-9-]+\\\.(com|net|org|io|app)/i;
        // Los COMENTARIOS quedan fuera: este mismo archivo y `config/site.js`
        // citan el patrón viejo para explicar el bug, y eso es correcto —
        // documentarlo no es cometerlo. Se filtra por línea en vez de exentar
        // ficheros: una lista de exenciones se convierte en escondite, y el
        // guard debe mirar el CÓDIGO, no el vocabulario.
        const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);

        const offenders = files.filter((f) =>
            readFileSync(f, 'utf-8').split('\n').some((l) => !isComment(l) && BAD.test(l))
        ).map((f) => f.replace(SRC, 'src'));

        expect(offenders).toEqual([]);
    });
});
