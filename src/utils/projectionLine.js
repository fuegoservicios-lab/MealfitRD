// [P1-ARQ25-F5-UI-STATES · 2026-09-05] Del snapshot de `GET /api/plans/{plan_id}/projections`
// (none/pending/ready/failed/stale) a UNA línea discreta. Puro; vive fuera del componente para que
// react-refresh solo vea componentes en el .jsx.
import { t, formatNumber } from '../i18n';

export const fmtRD = (n) => `RD$${formatNumber(Math.round(Number(n) || 0), { maximumFractionDigits: 0 })}`;

export const projectionLine = (snap) => {
    if (!snap || typeof snap !== 'object') return null;
    const status = snap.status;
    if (status === 'ready' || status === 'stale') {
        const windows = Array.isArray(snap.projection?.windows) ? snap.projection.windows : [];
        const main = windows.find((w) => w && w.kind === 'main') || windows[0] || null;
        const items = Number(main?.item_count) || 0;
        const cost = Number(main?.cost_rd);
        const days = Number(main?.days) || 0;
        if (!main || items <= 0) return null;
        const base = Number.isFinite(cost) && cost > 0
            ? t('Proyección del ciclo de {dias} días: {items} artículos · ≈{costo}', { dias: days, items, costo: fmtRD(cost) })
            : t('Proyección del ciclo de {dias} días: {items} artículos', { dias: days, items });
        if (status === 'stale') {
            return { tone: 'muted', text: `${base} · ${t('desactualizada, se recalcula con el próximo cambio del plan')}` };
        }
        return { tone: 'ok', text: base };
    }
    if (status === 'pending') return { tone: 'muted', text: t('Calculando la proyección de tu ciclo de compras…') };
    if (status === 'failed') {
        return snap.retrying
            ? { tone: 'muted', text: t('La proyección de compras se reintentará sola.') }
            : { tone: 'warn', text: t('No se pudo calcular la proyección de compras.') };
    }
    return null;
};
