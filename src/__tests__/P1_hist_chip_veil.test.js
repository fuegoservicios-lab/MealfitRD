/* [P1-HIST-CHIP-VEIL · 2026-08-13] Ningún chip del Historial puede ignorar el
 * tema.
 *
 * El dueño señaló «Calidad LLM: 2» saliendo blanquecino sobre el modal oscuro.
 * Al inventariar el archivo entero aparecieron DIECISÉIS reglas con el mismo
 * defecto — fondo claro clavado y sin override oscuro — de las que él solo
 * había visto la que su plan renderizaba: los tres badges de tier, los tres
 * bloques de días faltantes, el aviso de truncado, y seis chips de las
 * tarjetas del listado (lecciones, ajustes, semanas simplificadas, días
 * desplazados, despensa degradada, registro vacío).
 *
 * Es la cuarta vez en dos días que se reporta la misma clase de defecto
 * (banner ámbar de Recetas, banner del modal, ahora los chips), y las tres
 * anteriores se cerraron instancia por instancia. Por eso este guard NO
 * enumera clases: recorre el archivo, y falla ante CUALQUIER regla nueva con
 * fondo claro que no declare cómo se comporta en oscuro. Enumerar las
 * dieciséis habría dejado la puerta abierta a la diecisiete.
 *
 * Cobertura válida, dos formas:
 *   1. la regla nace de tokens o color-mix (una declaración, ambos temas), o
 *   2. la regla tiene su override en el bloque oscuro del archivo.
 * Un hex claro sin ninguna de las dos es el bug.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(
    path.resolve(__dirname, '../pages/History.module.css'),
    'utf8',
);

// Los comentarios llevan hex de ejemplo y selectores citados: fuera antes de
// parsear, o el guard mide la documentación en vez del código.
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const reglas = [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), cuerpo: m[2] }));

const clasesDe = (sel) => [...sel.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]);

// Clases con override en el bloque oscuro del propio archivo.
const conOverrideOscuro = new Set(
    reglas.filter((r) => r.sel.includes('data-theme="dark"'))
        .flatMap((r) => clasesDe(r.sel)),
);

/** Luminancia relativa WCAG de un hex. */
const luminancia = (hex) => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    const canal = (v) => {
        const n = parseInt(v, 16) / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(h.slice(0, 2))
        + 0.7152 * canal(h.slice(2, 4))
        + 0.0722 * canal(h.slice(4, 6));
};

describe('[P1-HIST-CHIP-VEIL] ningún fondo claro clavado sin respuesta para el tema oscuro', () => {
    it('el archivo se parsea (si esto falla, el resto del guard es humo)', () => {
        expect(reglas.length).toBeGreaterThan(100);
        expect(conOverrideOscuro.size).toBeGreaterThan(10);
    });

    it('toda regla con fondo claro declara cómo vive en oscuro', () => {
        const huerfanas = [];
        for (const { sel, cuerpo } of reglas) {
            if (sel.includes('data-theme') || !sel.startsWith('.')) continue;
            const clases = clasesDe(sel);
            if (clases.length === 0) continue;
            const fondo = cuerpo.match(/(?:^|[\s;])background(?:-color)?:\s*(#[0-9A-Fa-f]{3,8})/);
            if (!fondo) continue;                       // token o color-mix: ya sigue al tema
            if (luminancia(fondo[1]) < 0.5) continue;   // fondo ya oscuro: no es el defecto
            if (clases.some((c) => conOverrideOscuro.has(c))) continue;
            huerfanas.push(`${sel} → ${fondo[1]}`);
        }
        expect(
            huerfanas,
            'fondo claro clavado y sin override oscuro: en tema oscuro sale una caja '
            + 'blanquecina flotando (el caso «Calidad LLM: 2» del dueño). Arréglalo con '
            + 'la receta del velo —color-mix del acento al 14% sobre transparent— o '
            + 'dale su regla en el bloque oscuro:\n' + huerfanas.join('\n'),
        ).toEqual([]);
    });

    it('los chips migrados usan el velo translúcido, no un fondo opaco', () => {
        // El velo es load-bearing: medido sobre la fila contenedora en oscuro,
        // un fondo opaco de familia deja el chip a dL* 0,1 (invisible salvo por
        // el borde); el velo lo deja en 9,1.
        const conVelo = ['.tierBadgeOk', '.tierBadgeWarn', '.tierBadgeBad',
            '.tierBadgeNeutral', '.missingDaysInfo', '.missingDaysWarn',
            '.missingDaysBad', '.metricsTruncatedNotice', '.lessonsBadge',
            '.coherenceAdjustsBadge', '.simplifiedWeeksBadge', '.shiftDaysBadge',
            '.pantryDegradedBadge', '.zeroLogBadgeInfo', '.zeroLogBadgeAlarm',
            '.lifetimeProxyBadge'];
        for (const clase of conVelo) {
            const r = reglas.find((x) => x.sel === clase);
            expect(r, `no se encontró la regla ${clase}`).toBeTruthy();
            expect(
                r.cuerpo,
                `${clase} debe pintarse con un velo translúcido (color-mix … transparent)`,
            ).toMatch(/background:\s*color-mix\(in srgb,[^;]*transparent\)/);
        }
    });

    it('el chip que abrió el caso ya no es verde pálido fijo', () => {
        const ok = reglas.find((r) => r.sel === '.tierBadgeOk');
        expect(ok.cuerpo).not.toMatch(/#ECFDF5/i);
        expect(ok.cuerpo).toMatch(/var\(--success\)/);
        expect(ok.cuerpo).toMatch(/var\(--success-text\)/);
    });
});
