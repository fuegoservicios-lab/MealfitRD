// [P1-PLAN-LOTE-1059 · plan 1030 · 2026-11-17] La vitrina de semanas, en el cajón del calendario.
// Una fila horizontal con las semanas CERRADAS (número y estrellas, del servidor); tocar una lleva el mes a esa semana.
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Star } from 'lucide-react';
import { useT, useTn } from '../../i18n';
import { pedirSemanas } from '../../utils/progresoServidor';
import styles from './VitrinaDeSemanas.module.css';

const VitrinaDeSemanas = ({ userId, onElegir }) => {
    const t = useT();
    const tn = useTn();
    const [semanas, setSemanas] = useState(null);
    const fila = useRef(null);

    useEffect(() => {
        if (!userId) return undefined;
        let vivo = true;
        pedirSemanas(userId).then((l) => { if (vivo) setSemanas(l.filter((s) => s.cerrada)); }).catch(() => {});
        return () => { vivo = false; };
    }, [userId]);

    // la más reciente a la vista (al final de la fila)
    useEffect(() => {
        if (fila.current && semanas?.length) fila.current.scrollLeft = fila.current.scrollWidth;
    }, [semanas]);

    if (!semanas?.length) return null;
    return (
        <div className={styles.vitrina}>
            <p className={styles.titulo}>{t('Tus semanas')}</p>
            <div className={styles.fila} ref={fila} role="list">
                {semanas.map((s) => (
                    <button
                        key={s.numero}
                        type="button"
                        role="listitem"
                        className={`${styles.semana} ${s.estrellas === 3 ? styles.perfecta : ''}`}
                        onClick={() => onElegir?.(s.empieza)}
                        aria-label={`${t('Semana {n}', { n: s.numero })}: ${tn(s.estrellas, '{n} estrella', '{n} estrellas', { n: s.estrellas })}, ${t('{n} de {total} días en meta', { n: s.dias_en_meta, total: 7 })}`}
                    >
                        <span className={styles.numero}>{t('S{n}', { n: s.numero })}</span>
                        <span className={styles.estrellas} aria-hidden="true">
                            {[0, 1, 2].map((i) => (
                                <Star key={i} size={11} strokeWidth={2.5} className={i < s.estrellas ? styles.ganada : styles.vacia} />
                            ))}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};

VitrinaDeSemanas.propTypes = {
    userId: PropTypes.string,
    onElegir: PropTypes.func,
};

export default VitrinaDeSemanas;
