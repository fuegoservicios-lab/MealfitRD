/* [P1-SHELF-CHIP-VEIL · 2026-08-13] El chip de caducidad de la Nevera («Caduca
 * en 3 días») se pintaba en ámbar pálido clavado sobre la fila oscura.
 *
 * Es el mismo defecto que P1-HIST-CHIP-VEIL cerró en el Historial horas antes,
 * POR OTRA VÍA: aquí el color no vive en un módulo CSS sino en un helper JS
 * que devuelve estilos inline (`getShelfLifeBadgeStyle`). El guard blanket del
 * Historial recorre archivos .module.css, así que este chip le era invisible —
 * un detector que vigila una sola vía no avisa poco: su silencio se lee como
 * «todo limpio».
 *
 * Medido antes del arreglo: en tema oscuro el chip quedaba a +76 dL* por
 * encima de su propia fila (96 contra 19) — una etiqueta blanca sobre una fila
 * oscura. Y la incoherencia era interna: la fila que lo contiene (.row.low) YA
 * usaba el velo translúcido, y el chip de dentro se había quedado en el hex.
 *
 * Estilos inline no admiten media queries ni [data-theme], pero sí var() y
 * color-mix(): el navegador los resuelve en el contexto del elemento. Por eso
 * la misma receta vale aquí — el velo toma su luminosidad de la fila que tenga
 * debajo, en el tema que sea.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getShelfLifeBadgeStyle } from '../utils/shelfLife';

const SRC = fs.readFileSync(
    path.resolve(__dirname, '../utils/shelfLife.js'),
    'utf8',
);

const SEVERIDADES = ['expired', 'urgent', 'warn'];

describe('[P1-SHELF-CHIP-VEIL] el chip de caducidad sigue al tema', () => {
    it('ningún bucket devuelve un color clavado', () => {
        for (const sev of SEVERIDADES) {
            const estilo = getShelfLifeBadgeStyle(sev);
            for (const [prop, valor] of Object.entries(estilo)) {
                expect(
                    /#[0-9A-Fa-f]{3,8}\b/.test(String(valor)),
                    `${sev}.${prop} = ${valor} — un hex fijo ignora el tema: en oscuro `
                    + 'el chip sale como una etiqueta pálida sobre la fila',
                ).toBe(false);
            }
        }
    });

    it('los tres buckets se pintan con el velo translúcido', () => {
        for (const sev of SEVERIDADES) {
            const { background, borderColor } = getShelfLifeBadgeStyle(sev);
            expect(background, `${sev} sin velo`).toMatch(/^color-mix\(in srgb,.*transparent\)$/);
            expect(borderColor, `${sev} sin borde relativo`).toMatch(/^color-mix\(in srgb,.*transparent\)$/);
        }
    });

    it('cada bucket habla en la familia que le toca', () => {
        // warn en ámbar, los dos rojos en la familia de peligro: es la señal,
        // no decoración. Si se cruzan, «caduca en 3 días» grita como si ya
        // hubiera caducado.
        expect(getShelfLifeBadgeStyle('warn').background).toMatch(/var\(--warning\)/);
        expect(getShelfLifeBadgeStyle('warn').color).toMatch(/var\(--warning-text\)/);
        for (const sev of ['urgent', 'expired']) {
            expect(getShelfLifeBadgeStyle(sev).background).toMatch(/var\(--danger\)/);
            expect(getShelfLifeBadgeStyle(sev).color).toMatch(/var\(--danger-text\)/);
        }
    });

    it('expired pesa más que urgent (tres niveles, no dos)', () => {
        // El diseño original separaba los rojos por saturación del fondo
        // (red-100 contra red-50). Con velos, esa jerarquía es el porcentaje:
        // 26% contra 14% deja dL* 6,3 entre ambos, medido.
        const pct = (s) => Number(getShelfLifeBadgeStyle(s).background.match(/(\d+)%/)[1]);
        expect(pct('expired')).toBeGreaterThan(pct('urgent'));
        expect(pct('urgent')).toBe(pct('warn'));
    });

    it('un severity desconocido sigue cayendo en warn (fail-safe del default)', () => {
        expect(getShelfLifeBadgeStyle('lo-que-sea')).toEqual(getShelfLifeBadgeStyle('warn'));
    });

    it('el helper queda anclado al marker', () => {
        expect(SRC).toMatch(/P1-SHELF-CHIP-VEIL/);
    });
});

describe('[P1-SHELF-CHIP-VEIL] la vía JS entera, no solo este chip', () => {
    // El guard de los chips del Historial recorre archivos .module.css, así que
    // este defecto —color de UI clavado en un helper JS— le era invisible: el
    // dueño lo encontró antes que la suite. Cerrar la instancia sin cerrar la
    // vía deja el mismo silencio engañoso para el próximo helper.
    //
    // Alcance: src/utils. NO el resto del frontend, y es una exclusión
    // razonada, no pereza: Dashboard.jsx y Recipes.jsx construyen el HTML del
    // PDF, que se imprime sobre papel blanco — ahí un fondo claro es la
    // respuesta correcta y un guard ciego los marcaría a los 166.
    const UTILS = path.resolve(__dirname, '../utils');

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

    it('ningún helper de src/utils devuelve un color de UI pálido y fijo', () => {
        const hallazgos = [];
        for (const archivo of fs.readdirSync(UTILS).filter((f) => f.endsWith('.js'))) {
            const texto = fs.readFileSync(path.join(UTILS, archivo), 'utf8');
            texto.split('\n').forEach((linea, i) => {
                const limpia = linea.trim();
                if (limpia.startsWith('//') || limpia.startsWith('*')) return;
                if (!/(background|color|borderColor|border)\s*:/i.test(limpia)) return;
                for (const hex of limpia.match(/#[0-9A-Fa-f]{6}\b/g) || []) {
                    if (luminancia(hex) >= 0.75) {
                        hallazgos.push(`${archivo}:${i + 1} → ${hex}  ${limpia.slice(0, 60)}`);
                    }
                }
            });
        }
        expect(
            hallazgos,
            'color de UI pálido y fijo en un helper: el estilo inline que produzca '
            + 'ignorará el tema oscuro igual que lo hacía el chip de caducidad. Usa '
            + 'var() o color-mix(), que el navegador resuelve en el contexto del '
            + 'elemento:\n' + hallazgos.join('\n'),
        ).toEqual([]);
    });
});
