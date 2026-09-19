// [P1-PLAN-LOTE-124 · 2026-09-19] Los chips de «¿Cuándo?» — un solo sitio.
//
// Vivían copiados en el componedor (LogMealModal, lotes 99/105) y en el escáner de fotos (ScanMealModal, lote 106), y
// ya habían divergido: el componedor sabía abrirse en un día de hace más de dos («Ver días anteriores» registra hasta
// 7 atrás, el tope del backend) y el escáner no. Al llevar el escáner al diario hacía falta la misma regla en los dos.
//
// Funciones, no constantes: un `t()` en ámbito de módulo se congela en español.
import { formatDate } from '../../i18n';

export const DIAS_ATRAS_MAX = 7;

export const normalizarDiasAtras = (n) => Math.max(0, Math.min(DIAS_ATRAS_MAX, Number(n) || 0));

export const getDayOptions = (t) => [
    { value: 0, label: t('Hoy') },
    { value: 1, label: t('Ayer') },
    { value: 2, label: t('Antier') },
];

// Si el día pedido es más atrás que «Antier», se añade como chip con su fecha: el usuario ve en qué día va a quedar
// y puede cambiarlo; sin el chip, el valor sería invisible y el grupo no marcaría ninguno.
export const getDayOptionsCon = (t, daysAgo) => {
    const base = getDayOptions(t);
    const n = Number(daysAgo) || 0;
    if (n <= 2 || n > DIAS_ATRAS_MAX) return base;
    const d = new Date();
    d.setDate(d.getDate() - n);
    return [...base, { value: n, label: formatDate(d, { weekday: 'short', day: 'numeric' }) }];
};

/** El nombre del día para un aviso: «ayer», «antier» o la fecha. */
export const nombreDelDiaAtras = (t, daysAgo) => {
    const n = Number(daysAgo) || 0;
    if (n === 1) return t('ayer');
    if (n === 2) return t('antier');
    const d = new Date();
    d.setDate(d.getDate() - n);
    return formatDate(d, { weekday: 'long', day: 'numeric' });
};
