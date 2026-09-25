// [P1-PLAN-LOTE-225 · 2026-09-24] El aviso de presupuesto de la lista (Dashboard), en el idioma del usuario.
//
// El titular del aviso ya se traducía; debajo, las sustituciones («salmón → Pescado blanco») y las sugerencias de
// ahorro («Avena: la opción más económica del súper es Wala Funda 650 gr (RD$47)») llegaban del backend en español y
// se pintaban tal cual. Desde este lote la sugerencia de marca trae también sus piezas (`brand`, `presentation`,
// `price_rd`) y el resumen de marcas premium ya traía `saving_rd`: con eso se recompone la frase. Los nombres de
// alimento pasan por el léxico; la marca y la presentación son la etiqueta del producto en el súper y se quedan
// como están. En español, o si faltan las piezas (planes guardados antes), el texto del servidor tal cual.
import { getLocale } from '../i18n';
import { nombreDelAlimento } from './nombresDeAlimentos';

const _esBase = (locale) => !locale || locale === 'es-DO';

/** Una sugerencia de ahorro (`budget_reconciliation.suggestions[i]`), lista para pintar. */
export function sugerenciaDePresupuesto(s, t, fmtRD, locale = getLocale()) {
    if (typeof s === 'string') return s;
    if (!s || typeof s !== 'object') return '';
    const texto = typeof s.text === 'string' ? s.text : '';
    if (_esBase(locale) || typeof t !== 'function' || typeof fmtRD !== 'function') return texto;
    const ahorro = Number(s.saving_rd);
    if (s.type === 'marca_premium_total' && Number.isFinite(ahorro) && ahorro > 0) {
        return t('~{ahorro} de tu sobrecosto son tus marcas premium elegidas — cámbialas en /supermercado por la opción más económica para ahorrar.', { ahorro: fmtRD(ahorro) });
    }
    const precio = Number(s.price_rd);
    if (s.type === 'marca' && typeof s.item === 'string' && s.item && s.brand && Number.isFinite(precio)) {
        return t('{alimento}: la opción más económica del súper es {producto} ({precio})', {
            alimento: nombreDelAlimento(s.item, locale),
            producto: [s.brand, s.presentation].filter((x) => typeof x === 'string' && x.trim()).join(' '),
            precio: fmtRD(precio),
        });
    }
    return texto;
}

/** Una sustitución del abaratado («salmón → Pescado blanco»): cada lado por el léxico de alimentos. */
export function sustitucionDePresupuesto(s, locale = getLocale()) {
    if (typeof s !== 'string') return '';
    if (_esBase(locale)) return s;
    const partes = s.split(' → ');
    if (partes.length !== 2) return s;
    return `${nombreDelAlimento(partes[0].trim(), locale)} → ${nombreDelAlimento(partes[1].trim(), locale)}`;
}
