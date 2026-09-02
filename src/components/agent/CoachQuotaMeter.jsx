import { MessageSquare } from 'lucide-react';
import { useT, formatDate } from '../../i18n';
import styles from './CoachQuotaMeter.module.css';

/* [P1-COACH-QUOTA-METER · 2026-09-02] Medidor de la cuota MENSUAL del coach.
   El backend ya separaba el chat de los planes (verify_coach_quota) pero ninguna
   pantalla lo mostraba: el usuario descubría el tope con un 402 de texto. Mismo
   lenguaje de color que el medidor de créditos: ámbar a partir del 80 % usado,
   rojo solo en 0 restante. Decisión del dueño (2026-09-02): ventana mensual,
   no ventanas rodantes. `quota` = {used, limit, remaining, resets_at}.

   [P2-COACH-QUOTA-MOBILE · 2026-09-02] Tres presentaciones:
   - `pill` (escritorio): píldora en la cabecera, junto al menú.
   - `row` (móvil): fila informativa dentro del menú ☰ — la cabecera móvil
     queda limpia (historial · título · menú), que es lo que el dueño no
     quería perder.
   - `caption` (móvil): línea discreta sobre el cuadro de texto, SOLO cuando
     queda poco (ámbar) o nada (rojo) si `onlyWhenLow`. */
export function coachQuotaState(quota) {
    if (!quota || typeof quota.limit !== 'number' || quota.limit <= 0) return null;
    const used = Math.max(0, Number(quota.used) || 0);
    const remaining = typeof quota.remaining === 'number'
        ? Math.max(0, quota.remaining)
        : Math.max(0, quota.limit - used);
    const state = remaining <= 0 ? 'depleted' : (used / quota.limit >= 0.8 ? 'low' : 'healthy');
    return { used, remaining, limit: quota.limit, state };
}

export default function CoachQuotaMeter({ quota, variant = 'pill', onlyWhenLow = false }) {
    const t = useT();
    const q = coachQuotaState(quota);
    if (!q) return null;
    if (onlyWhenLow && q.state === 'healthy') return null;
    // La ventana del contador es UTC (día 1 a las 00:00Z): sin `timeZone: 'UTC'`, en RD salía «30 sept».
    const fecha = quota.resets_at ? formatDate(quota.resets_at, { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
    const renueva = fecha ? t('Se renueva el {fecha}', { fecha }) : '';
    const aria = t('{remaining} de {limit} mensajes del coach este mes', { remaining: q.remaining, limit: q.limit })
        + (renueva ? `. ${renueva}` : '');
    const cls = `${styles.meter} ${styles[variant]} ${styles[q.state]}`;
    if (variant === 'caption') {
        return (
            <p className={cls} role="status" data-state={q.state} data-variant="caption">
                <MessageSquare size={12} strokeWidth={2} aria-hidden="true" />
                <span>{t('Mensajes')} <b>{q.remaining}</b>/{q.limit}{renueva ? ` · ${renueva}` : ''}</span>
            </p>
        );
    }
    if (variant === 'row') {
        return (
            <div className={cls} role="note" aria-label={aria} data-state={q.state} data-variant="row">
                <MessageSquare size={16} strokeWidth={2} aria-hidden="true" />
                <span className={styles.rowText}>
                    <span className={styles.label}>{t('Mensajes')}</span>
                    <span className={styles.count}><b>{q.remaining}</b>/{q.limit}</span>
                    {renueva && <span className={styles.renews}>{renueva}</span>}
                </span>
            </div>
        );
    }
    return (
        <div className={cls} role="img" aria-label={aria} title={aria} data-state={q.state} data-variant="pill">
            <MessageSquare size={14} strokeWidth={2} aria-hidden="true" />
            <span className={styles.count}><b>{q.remaining}</b>/{q.limit}</span>
            <span className={styles.label}>{t('Mensajes')}</span>
        </div>
    );
}
