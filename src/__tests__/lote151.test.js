// [P1-PLAN-LOTE-151 · 2026-09-21] El sombreado del ratón con la forma del control.
//
// El dueño, con captura de «Marcas del súper»: «cuando le paso el mouse por encima el sombreado no es perfecto […]
// los bordes no son correctos, está estilo cuadrado y la figura del menú es estilo círculo».
//
// Causa: las tres variantes de `data-hover` (lote 144) pintan con SOMBRAS —el velo es `inset 0 0 0 999px` y el
// anillo `0 0 0 1px`— y una sombra sigue el `border-radius` DEL PROPIO elemento, no el de su contenedor. Un botón
// sin radio dentro de una tarjeta redondeada pinta un rectángulo que se sale por las esquinas. En «Marcas del
// súper» el contenedor ni siquiera puede recortarlo: lleva un aviso de 2026-07-02 de NO poner `overflow:hidden`
// porque se comería el popover absoluto del listado.
//
// Cuatro controles estaban así; el de la Nevera era el más visible, porque su gemelo «+» sí es un círculo.
// Este test es el ratchet: cualquier `data-hover` nuevo sin radio propio lo falla antes de llegar a producción.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(process.cwd(), 'src');

function ficheros(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === '__tests__' ? [] : ficheros(p);
        return /\.jsx?$/.test(e.name) ? [p] : [];
    });
}

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 151 · el velo del ratón tiene la forma del control', () => {
    it('todo `data-hover` declara su propio radio (o lo hereda de una clase / un estilo compartido)', () => {
        const sinRadio = [];
        for (const abs of ficheros(RAIZ)) {
            const texto = fs.readFileSync(abs, 'utf-8').replace(/\r\n/g, '\n');
            if (!texto.includes('data-hover=')) continue;
            const lineas = texto.split('\n');
            for (let i = 0; i < lineas.length; i++) {
                if (!lineas[i].includes('data-hover=')) continue;
                // el cuerpo de la etiqueta: hacia arriba hasta el `<Tag`, hacia abajo hasta el `>` que la cierra
                let ini = i;
                while (ini > 0 && !/<[A-Za-z]/.test(lineas[ini])) ini--;
                let fin = i;
                while (fin < lineas.length - 1 && !/^\s*\/?>/.test(lineas[fin])) fin++;
                const cuerpo = lineas.slice(ini, fin + 1).join('\n');
                if (/borderRadius|border-radius|className/.test(cuerpo)) continue;
                // `style={{ ...algo }}`: vale si ESE objeto lleva el radio
                const esparcidos = [...cuerpo.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
                const heredado = esparcidos.some((nombre) => {
                    const def = new RegExp(`const ${nombre}\\s*=\\s*\\{[\\s\\S]{0,600}?\\};`).exec(texto);
                    return def && /borderRadius/.test(def[0]);
                });
                if (!heredado) sinRadio.push(`${path.relative(RAIZ, abs).replace(/\\/g, '/')}:${i + 1}`);
            }
        }
        expect(sinRadio, 'un `data-hover` sin radio pinta el velo cuadrado sobre un control redondeado').toEqual([]);
    });

    it('el disparador de «Marcas del súper» usa el radio INTERIOR de su tarjeta', () => {
        const src = leer('src/components/dashboard/SupermarketBrands.jsx');
        // la tarjeta: 0,75rem y 1px de borde; el botón va por dentro, así que su radio es uno menos
        expect(src).toContain("borderRadius: '0.75rem',");
        expect(src).toContain("borderRadius: 'calc(0.75rem - 1px)',");
        // y sigue sin recortar: el popover del listado es absoluto (aviso de P3-BRANDS-POPOVER-NO-DEFORM)
        expect(src).toContain('SIN overflow:hidden');
    });

    it('el «−» de la Nevera es tan redondo como el «+» que tiene al lado', () => {
        const src = leer('src/pages/Pantry.jsx');
        const i = src.indexOf("aria-label={t('Disminuir cantidad')}");
        const j = src.indexOf("aria-label={t('Aumentar cantidad')}");
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
        expect(src.slice(src.lastIndexOf('<button', i), i)).toContain("borderRadius: '99px'");
        expect(src.slice(src.lastIndexOf('<button', j), j)).toContain("borderRadius: '99px'");
    });

    it('un botón lleno conserva SU resplandor: el hover lo suma con drop-shadow, no lo sustituye', () => {
        // «el sombreado al pasarle el mouse por encima a este botón no me gusta» (Reponer mi Nevera). La regla del
        // 144 pisaba con `!important` la sombra CIAN del botón y le ponía una negra, más un anillo de
        // `currentColor` — que en un botón lleno es el color del TEXTO, oscuro. `drop-shadow` vive en el `filter`:
        // se suma a la sombra propia y sigue la forma del botón.
        const css = leer('src/index.css');
        const i = css.indexOf('[data-hover="boton"]:not(:disabled):hover {');
        const regla = css.slice(i, css.indexOf('}', i));
        expect(regla).toContain('drop-shadow(');
        expect(regla).not.toContain('box-shadow');
        expect(regla).not.toContain('!important');
        expect(regla).not.toContain('currentColor');
        // y el botón de «Reponer mi Nevera» sigue teniendo resplandor propio que conservar
        const sn = leer('src/components/dashboard/StatusNotice.module.css');
        expect(sn).toContain('box-shadow: 0 8px 18px -8px color-mix(in srgb, var(--sn-tone) 80%, transparent);');
    });

    it('las tres variantes siguen pintando con sombras — que es POR QUÉ hace falta el radio', () => {
        const css = leer('src/index.css');
        expect(css).toContain('[data-hover="fila"]:not(:disabled):hover');
        expect(css).toMatch(/\[data-hover="fila"\]:not\(:disabled\):hover \{\s*\n\s*box-shadow: inset 0 0 0 999px/);
        expect(css).toMatch(/\[data-hover="icono"\]:not\(:disabled\):hover \{\s*\n\s*box-shadow: inset 0 0 0 999px/);
        // y ninguna mueve el botón: P2-HOVER-NO-MOTION sigue en pie
        expect(css).not.toMatch(/\[data-hover="boton"\]:not\(:disabled\):hover \{[^}]*translate/);
    });
});
