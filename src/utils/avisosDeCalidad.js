// [P1-PLAN-LOTE-225 · 2026-09-24] Los avisos de calidad de «Cambiar plato» y «Regenerar día», en el idioma del
// usuario.
//
// El backend los escribe en español (`swap_quality_warning`, `day_quality_warning`) y el cliente los pintaba tal
// cual como descripción del toast: el título salía traducido y la frase de debajo, en español. El del plato es
// una frase fija, así que basta su clave; el del día lleva cifras dentro («quedó en ~95g de proteína (objetivo
// ~130g)»), y para ése el backend manda además `day_quality_warning_detail` con los números sueltos.
//
// En español se sigue pintando la prosa del servidor tal cual: es la fuente, y así un cambio de redacción allí no
// necesita tocar nada aquí.
import { formatNumber, formatPercent, getLocale, i18nKey } from '../i18n';

/** La frase del aviso del plato: byte-idéntica a la de `routers/plans.py` (P2-SWAP-BAND-WARNING). */
export const AVISO_PLATO_LEJOS_DE_PROTEINA = i18nKey('Este plato quedó algo alejado de tu objetivo de proteína para esta comida. Puedes volver a cambiarlo si prefieres más precisión.');

const _esBase = (locale) => !locale || locale === 'es-DO';

const _lista = (items, locale) => {
    try {
        return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
    } catch {
        return items.join('; ');
    }
};

/** El aviso de un plato cambiado que quedó lejos de su objetivo de proteína (o '' si no hay aviso). */
export function avisoDeCalidadDelPlato(meal, t, locale = getLocale()) {
    const prosa = typeof meal?.swap_quality_warning === 'string' ? meal.swap_quality_warning.trim() : '';
    if (!prosa) return '';
    if (_esBase(locale) || typeof t !== 'function') return prosa;
    return t(AVISO_PLATO_LEJOS_DE_PROTEINA);
}

function _deficit(d, t) {
    const valor = Number(d?.value);
    const objetivo = Number(d?.target);
    if (!Number.isFinite(valor) || !Number.isFinite(objetivo)) return null;
    const n = { valor: formatNumber(valor), objetivo: formatNumber(objetivo) };
    if (d.axis === 'protein') return t('~{valor} g de proteína (objetivo ~{objetivo} g)', n);
    if (d.axis === 'kcal') return t('~{valor} kcal (objetivo ~{objetivo} kcal)', n);
    if (d.axis === 'carbs') return t('~{valor} g de carbohidratos (objetivo ~{objetivo} g)', n);
    return null;
}

/**
 * El aviso de un día regenerado que quedó por debajo de su objetivo o fuera de banda (o '' si no hay aviso).
 *
 * Sin `day_quality_warning_detail` (backend anterior a este lote) y fuera del español, una frase genérica
 * traducida: mejor que la prosa española bajo un título en otro idioma.
 */
export function avisoDeCalidadDelDia(data, t, locale = getLocale()) {
    const prosa = typeof data?.day_quality_warning === 'string' ? data.day_quality_warning.trim() : '';
    if (!prosa) return '';
    if (_esBase(locale) || typeof t !== 'function') return prosa;
    const det = data?.day_quality_warning_detail;
    if (det && det.kind === 'deficit' && Array.isArray(det.deficits)) {
        const partes = det.deficits.map((d) => _deficit(d, t)).filter(Boolean);
        if (partes.length) {
            const cola = det.pantry_limited
                ? t('Tu Nevera puede no tener suficiente para tu objetivo: agrega más ítems y vuelve a generar.')
                : t('Ajusta las porciones o renueva el ciclo para acercarte a tu objetivo (tu Nevera sí alcanza; es un ajuste fino de cantidades).');
            return `${t('Este día quedó en {deficits}, por debajo de tu objetivo.', { deficits: _lista(partes, locale) })} ${cola}`;
        }
    }
    if (det && det.kind === 'band' && Number.isFinite(Number(det.precision_pct))) {
        const cola = det.pantry_limited
            ? t('Tu Nevera puede no tener suficiente para clavar tu objetivo: agrega más ítems y vuelve a generar.')
            : t('Ajusta las porciones o renueva el ciclo para acercarte a tu objetivo.');
        return `${t('Este día quedó con los macros fuera de tu banda objetivo (precisión {porcentaje}).', { porcentaje: formatPercent(Number(det.precision_pct)) })} ${cola}`;
    }
    return t('Este día quedó por debajo de tu objetivo. Ajusta las porciones o vuelve a generarlo.');
}
