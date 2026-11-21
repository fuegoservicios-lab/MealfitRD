// [P1-PLAN-LOTE-1145 · 2026-11-21] «Tu día termina cuando duermes» (el dueño, 4:23 sin dormir: «se reinició el contador
// calórico; ¿cómo mejoramos esa área para la gente que tiene el horario desorganizado?»).
//
// `SincronizarDiaActivo` (en el marco del panel, no pinta nada): pide al servidor el día que el usuario vive
// (`GET /api/diary/dia-activo`) al abrir, al volver a la app y tras registrar o hablar con el coach, y lo aplica a
// `diaBiologico.js`; si el día cambió, avisa con `mealfit:diary-changed` para que el contador se rehaga.
//
// `AvisoDiaActivo` (en el contador): «Sigues en tu viernes · no has dormido» con «Empezar mi sábado», o, de mañana
// tras una noche activa, «¿Aún no has dormido? Seguir en mi viernes».
import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Moon, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import { estadoDelDiaActivo, suscribirDiaActivo } from '../../utils/diaBiologico';
import { pedirDiaActivo, elegirDiaActivo } from '../../utils/diaActivo';
import { formatDate, useT } from '../../i18n';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import styles from './DiaActivo.module.css';

/** No pinta nada: mantiene al día la regla del día activo mientras el panel está abierto. */
export function SincronizarDiaActivo({ activo }) {
    useEffect(() => {
        if (!activo) return undefined;
        let vivo = true;
        const pedir = () => { if (vivo) pedirDiaActivo(); };
        pedir();
        const alVolver = () => { if (document.visibilityState === 'visible') pedir(); };
        const trasActividad = (e) => { if (e?.detail?.source !== 'dia-activo') pedir(); };
        // cada 10 min con la app abierta: cruza las 4:00 (o el final del día extendido) sin tener que salir y volver
        const reloj = setInterval(() => { if (document.visibilityState === 'visible') pedir(); }, 10 * 60 * 1000);
        document.addEventListener('visibilitychange', alVolver);
        window.addEventListener('mealfit:chat-turn-done', trasActividad);
        window.addEventListener('mealfit:diary-changed', trasActividad);
        return () => {
            vivo = false;
            clearInterval(reloj);
            document.removeEventListener('visibilitychange', alVolver);
            window.removeEventListener('mealfit:chat-turn-done', trasActividad);
            window.removeEventListener('mealfit:diary-changed', trasActividad);
        };
    }, [activo]);
    return null;
}
SincronizarDiaActivo.propTypes = { activo: PropTypes.bool };

const _diaSemana = (iso) => {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-').map(Number);
    return formatDate(new Date(y, (m || 1) - 1, d || 1, 12), { weekday: 'long' });
};
const _siguiente = (iso) => {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    const f = new Date(y, (m || 1) - 1, (d || 1) + 1, 12);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

/** El aviso del contador. Sin nada que decir, no pinta nada. */
export function AvisoDiaActivo() {
    const t = useT();
    const [estado, setEstado] = useState(() => estadoDelDiaActivo());
    const [enviando, setEnviando] = useState(false);
    const [descartado, setDescartado] = useState(() => {
        return safeLocalStorageGet('mealfit_dia_activo_descartado', '') || '';
    });
    useEffect(() => suscribirDiaActivo(setEstado), []);
    // la pregunta suave («¿Aún no has dormido?») se puede cerrar: no vuelve esa mañana
    const descartar = useCallback((dia) => {
        setDescartado(dia);
        safeLocalStorageSet('mealfit_dia_activo_descartado', dia);
    }, []);

    const elegir = useCallback(async (accion) => {
        setEnviando(true);
        try {
            await elegirDiaActivo(accion);
        } catch {
            toast.error(t('No se pudo cambiar el día. Inténtalo de nuevo.'), { id: 'dia-activo' });
        } finally {
            setEnviando(false);
        }
    }, [t]);

    if (!estado) return null;
    if (estado.extendido) {
        const hoy = _diaSemana(estado.dia);
        const manana = _diaSemana(_siguiente(estado.dia));
        const motivo = estado.motivo === 'corte_personal'
            ? t('Tu día termina más tarde (Configuración)')
            : estado.motivo === 'pedido' ? t('Lo elegiste tú') : t('No has dormido: tu día sigue');
        return (
            <div className={styles.aviso} role="status">
                <Moon size={18} className={styles.icono} aria-hidden="true" />
                <div className={styles.texto}>
                    <strong>{t('Sigues en tu {dia}', { dia: hoy })}</strong>
                    <span>{motivo}</span>
                </div>
                <button type="button" className={styles.accion} onClick={() => elegir('empezar')} disabled={enviando}>
                    <Sun size={16} aria-hidden="true" />{t('Empezar mi {dia}', { dia: manana })}
                </button>
            </div>
        );
    }
    if (estado.puede_seguir && estado.anterior && descartado !== estado.anterior) {
        return (
            <div className={`${styles.aviso} ${styles.avisoSuave}`} role="status">
                <Moon size={18} className={styles.icono} aria-hidden="true" />
                <div className={styles.texto}>
                    <strong>{t('¿Aún no has dormido?')}</strong>
                    <span>{t('Lo que comas seguirá contando en tu {dia}.', { dia: _diaSemana(estado.anterior) })}</span>
                </div>
                <button type="button" className={styles.accion} onClick={() => elegir('seguir')} disabled={enviando}>
                    {t('Seguir en mi {dia}', { dia: _diaSemana(estado.anterior) })}
                </button>
                <button type="button" className={styles.cerrar} onClick={() => descartar(estado.anterior)} aria-label={t('Cerrar')}>
                    <X size={16} aria-hidden="true" />
                </button>
            </div>
        );
    }
    return null;
}

export default SincronizarDiaActivo;
