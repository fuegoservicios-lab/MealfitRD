import { MessageSquare } from 'lucide-react';
import { useT, formatDate } from '../../i18n';
import styles from './CoachQuotaMeter.module.css';

/* [P1-COACH-QUOTA-METER · 2026-09-02] Medidor de la cuota MENSUAL del coach.
   El backend ya separaba el chat de los planes (verify_coach_quota) pero ninguna
   pantalla lo mostraba: el usuario descubría el tope con un 402 de texto. Mismo
   lenguaje de color que el medidor de créditos: ámbar a partir del 80 % usado,
   rojo solo en 0 restante. Decisión del dueño (2026-09-02): ventana mensual,
   no ventanas rodantes. `quota` = {used, limit, remaining, resets_at}. */
export default function CoachQuotaMeter({ quota, compact = false }) {
    const t = useT();
    if (!quota || typeof quota.limit !== 'number' || quota.limit <= 0) return null;
    const used = Math.max(0, Number(quota.used) || 0);
    const remaining = typeof quota.remaining === 'number'
        ? Math.max(0, quota.remaining)
        : Math.max(0, quota.limit - used);
    const state = remaining <= 0 ? 'depleted' : (used / quota.limit >= 0.8 ? 'low' : 'healthy');
    const fecha = quota.resets_at ? formatDate(quota.resets_at, { day: 'numeric', month: 'short' }) : '';
    const renueva = fecha ? t('Se renueva el {fecha}', { fecha }) : '';
    const aria = t('{remaining} de {limit} mensajes del coach este mes', { remaining, limit: quota.limit })
        + (renueva ? `. ${renueva}` : '');
    const cls = `${styles.meter} ${styles[state]}${compact ? ` ${styles.compact}` : ''}`;
    return (
        <div className={cls} role="img" aria-label={aria} title={aria} data-state={state}>
            <MessageSquare size={14} strokeWidth={2} aria-hidden="true" />
            <span className={styles.count}><b>{remaining}</b>/{quota.limit}</span>
            {!compact && <span className={styles.label}>{t('Mensajes')}</span>}
        </div>
    );
}
