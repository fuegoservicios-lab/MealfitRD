/* [P1-HIST-BANNER-TOKENS · 2026-08-12] Los banners del modal del Historial
 * (action_required rojo + stuck azul) vivían en claros CLAVADOS (#FEF2F2,
 * #EFF6FF, vidrio blanco rgba(255,255,255)): en tema oscuro eran cajas crema
 * flotando en el modal — lo que el dueño vio con «Tu plan necesita
 * regenerarse». Tercera vez del mismo defecto (P1-WARN-BANNER-TOKENS lo cerró
 * en Recipes un día antes), así que el contrato es el mismo: esos bloques
 * hablan SOLO en tokens de las familias danger e info, que ya traen su
 * variante oscura del DS. (Ojo: no escribir asterisco-guión-guión en este
 * comentario terminando en asterisco-slash — cierra el bloque, bug real hoy.)
 *
 * ÚNICA excepción: .actionBannerCtaButton — botón sólido autocontenido
 * (fondo rojo 600-700 + texto blanco propio), legible sobre CUALQUIER tema
 * precisamente porque no hereda nada del fondo.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(
    path.resolve(__dirname, '../pages/History.module.css'),
    'utf8',
);

// Reglas { selector, cuerpo } de primer nivel (los módulos no anidan).
// SIN comentarios primero: un comentario no tiene llaves, así que se pega al
// selector siguiente y la igualdad exacta de abajo deja de encontrar nada.
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const reglas = [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), cuerpo: m[2] }));

const deBanner = reglas.filter(
    (r) => /\.(actionBanner|stuckBanner)/.test(r.sel)
        && !r.sel.includes('actionBannerCtaButton'),
);

describe('[P1-HIST-BANNER-TOKENS] banners del modal en tokens, no en hex claros', () => {
    it('alcanza a los dos banners (rojo y azul)', () => {
        const sels = deBanner.map((r) => r.sel).join(' ');
        expect(sels).toContain('.actionBanner');
        expect(sels).toContain('.stuckBanner');
        expect(deBanner.length).toBeGreaterThanOrEqual(10);
    });

    it('ningún color clavado fuera del botón CTA', () => {
        for (const r of deBanner) {
            expect(
                /#[0-9A-Fa-f]{3,8}\b/.test(r.cuerpo),
                `${r.sel} declara un hex fijo: en el tema que no se miró al escribirlo, miente`,
            ).toBe(false);
            expect(
                /rgba?\(\s*255\s*,\s*255\s*,\s*255/.test(r.cuerpo),
                `${r.sel} usa vidrio blanco fijo: sobre el rojo oscuro sale una tabla gris`,
            ).toBe(false);
        }
    });

    it('las superficies nacen de la familia de tokens correcta', () => {
        const cuerpoDe = (sel) => deBanner.find((r) => r.sel === sel)?.cuerpo || '';
        expect(cuerpoDe('.actionBanner')).toMatch(/var\(--danger-bg\)/);
        expect(cuerpoDe('.actionBanner')).toMatch(/var\(--danger-border\)/);
        expect(cuerpoDe('.stuckBanner')).toMatch(/var\(--info-bg\)/);
        expect(cuerpoDe('.actionBannerTitle')).toMatch(/var\(--danger-text\)/);
        expect(cuerpoDe('.stuckBannerTitle')).toMatch(/var\(--info-text\)/);
    });

    it('el vidrio de las filas per-chunk sigue al tema (nace de --bg-card)', () => {
        const vidrio = deBanner.find((r) => r.sel === '.actionBannerReasons')?.cuerpo || '';
        expect(vidrio).toMatch(/color-mix\(in srgb,\s*var\(--bg-card\)/);
    });
});
