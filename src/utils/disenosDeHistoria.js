// [P1-PLAN-LOTE-1095 · 2026-11-18] El dueño: «quiero que tenga 7 diseños wow, útiles para cada día de la semana, con
// nombres creativos y abstractos». Siete diseños, uno por día (domingo primero, como «Tu semana»), sobre las TRES
// composiciones que ya existen (titular, minimal, cristal): cada diseño es una composición + su luz.
//  · `tinte`: cómo se tiñe TU foto (`color` = duotono con un degradado; `gris` = blanco y negro con contraste).
//  · `noche`: el fondo sin foto (tres tonos y tres brillos).
//  · `acento`: el par de colores de la cifra, la barra y el anillo (sin él, el oro de la app).
// Las claves viejas (titular, minimal, cristal) siguen siendo diseños (Aurora, Pulso, Bruma): nada guardado se rompe.
// Colores en rgb(): es tinta de un JPEG, no interfaz (el trinquete de hex es de la interfaz).

import { i18nKey } from '../i18n';

const NOCHE_APP = Object.freeze({
    tonos: ['rgb(11, 17, 32)', 'rgb(30, 27, 75)', 'rgb(49, 46, 129)'],
    brillos: ['236, 72, 153', '99, 102, 241', '245, 158, 11'],
});

export const DISENOS = Object.freeze([
    { clave: 'titular', base: 'titular', nombre: i18nKey('Aurora'), dia: 0, noche: NOCHE_APP },
    { clave: 'minimal', base: 'minimal', nombre: i18nKey('Pulso'), dia: 1, noche: NOCHE_APP },
    { clave: 'cristal', base: 'cristal', nombre: i18nKey('Bruma'), dia: 2, noche: NOCHE_APP },
    {
        clave: 'brasa', base: 'titular', nombre: i18nKey('Brasa'), dia: 3,
        tinte: { modo: 'color', de: 'rgb(251, 146, 60)', a: 'rgb(225, 29, 72)', alfa: 0.5 },
        acento: ['rgb(254, 215, 170)', 'rgb(249, 115, 22)'],
        noche: { tonos: ['rgb(23, 8, 6)', 'rgb(69, 20, 10)', 'rgb(124, 45, 18)'], brillos: ['249, 115, 22', '225, 29, 72', '250, 204, 21'] },
    },
    {
        clave: 'marea', base: 'cristal', nombre: i18nKey('Marea'), dia: 4,
        tinte: { modo: 'color', de: 'rgb(34, 211, 238)', a: 'rgb(13, 148, 136)', alfa: 0.45 },
        acento: ['rgb(165, 243, 252)', 'rgb(6, 182, 212)'],
        noche: { tonos: ['rgb(3, 15, 25)', 'rgb(8, 47, 73)', 'rgb(17, 94, 89)'], brillos: ['34, 211, 238', '20, 184, 166', '99, 102, 241'] },
    },
    {
        // [P1-PLAN-LOTE-1101] Neón con forma PROPIA en el día: el anillo grande que brilla (la semana y el mes no la
        // tienen: allí es el sticker centrado)
        clave: 'neon', base: 'anillo', basePeriodo: 'minimal', nombre: i18nKey('Neón'), dia: 5,
        tinte: { modo: 'color', de: 'rgb(217, 70, 239)', a: 'rgb(79, 70, 229)', alfa: 0.5 },
        acento: ['rgb(249, 168, 212)', 'rgb(217, 70, 239)'],
        noche: { tonos: ['rgb(10, 4, 25)', 'rgb(46, 16, 101)', 'rgb(88, 28, 135)'], brillos: ['217, 70, 239', '34, 211, 238', '236, 72, 153'] },
    },
    {
        clave: 'eclipse', base: 'titular', nombre: i18nKey('Eclipse'), dia: 6,
        tinte: { modo: 'gris' },
        acento: ['rgb(248, 250, 252)', 'rgb(148, 163, 184)'],
        noche: { tonos: ['rgb(5, 5, 8)', 'rgb(23, 23, 28)', 'rgb(39, 39, 46)'], brillos: ['255, 255, 255', '148, 163, 184', '71, 85, 105'] },
    },
]);

export const CLAVES_DE_DISENO = Object.freeze(DISENOS.map((d) => d.clave));
const _POR_CLAVE = Object.fromEntries(DISENOS.map((d) => [d.clave, d]));

/** El diseño de esa clave (una desconocida → Aurora). */
export const disenoDe = (clave) => _POR_CLAVE[clave] || DISENOS[0];

/** La composición que pinta ese diseño: 'titular' | 'minimal' | 'cristal'. */
export const baseDe = (clave) => disenoDe(clave).base;

/** [1101] La composición con la que se pinta: la semana y el mes (`conPintor`) solo saben titular, minimal y cristal. */
export const composicionDe = (clave, conPintor = false) => {
    const d = disenoDe(clave);
    return conPintor ? (d.basePeriodo || d.base) : d.base;
};

/** El diseño del día de la semana de `fecha` (domingo = Aurora … sábado = Eclipse). */
export const disenoDelDia = (fecha = new Date()) => {
    const d = fecha instanceof Date && !Number.isNaN(fecha.getTime()) ? fecha.getDay() : 0;
    return DISENOS.find((x) => x.dia === d) || DISENOS[0];
};

/** Tiñe lo ya pintado (la foto) con la luz del diseño. Si el navegador no sabe el modo de mezcla, no tiñe: mejor la
 *  foto tal cual que un velo de color plano encima. */
export function tintarFoto(ctx, clave, ancho, alto) {
    const tinte = disenoDe(clave).tinte;
    if (!tinte || !ctx) return false;
    ctx.save();
    try {
        if (tinte.modo === 'gris') {
            ctx.globalCompositeOperation = 'saturation';
            if (ctx.globalCompositeOperation !== 'saturation') return false;
            ctx.fillStyle = 'rgb(128, 128, 128)';
            ctx.fillRect(0, 0, ancho, alto);
            ctx.globalCompositeOperation = 'soft-light';
            if (ctx.globalCompositeOperation === 'soft-light') {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.fillRect(0, 0, ancho, alto);
            }
            return true;
        }
        ctx.globalCompositeOperation = 'color';
        if (ctx.globalCompositeOperation !== 'color') return false;
        ctx.globalAlpha = tinte.alfa ?? 0.5;
        const g = ctx.createLinearGradient(0, 0, ancho * 0.6, alto);
        g.addColorStop(0, tinte.de); g.addColorStop(1, tinte.a);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, ancho, alto);
        return true;
    } catch { return false; } finally { ctx.restore(); }
}
