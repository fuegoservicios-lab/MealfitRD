// [P1-PLAN-LOTE-1059 · plan 1030 · 2026-11-17] La vitrina de semanas, en el cajón del calendario.
// Una fila horizontal con las semanas CERRADAS (número y estrellas, del servidor); tocar una lleva el mes a esa semana.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Star } from 'lucide-react';
import { formatNumber, useT, useTn } from '../../i18n';
import { leerSemanasGuardadas, pedirSemanas } from '../../utils/progresoServidor';
import styles from './VitrinaDeSemanas.module.css';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const _soloCerradas = (lista) => (Array.isArray(lista) ? lista.filter((s) => s.cerrada) : null);

const _mismasSemanas = (a, b) => {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (
            a[i]?.numero !== b[i]?.numero ||
            a[i]?.estrellas !== b[i]?.estrellas ||
            a[i]?.dias_en_meta !== b[i]?.dias_en_meta ||
            a[i]?.puntos !== b[i]?.puntos ||
            a[i]?.empieza !== b[i]?.empieza
        ) return false;
    }
    return true;
};

const VitrinaDeSemanas = ({ userId, onElegir, version = 0 }) => {
    const t = useT();
    const tn = useTn();
    const [estado, setEstado] = useState(() => ({
        uid: userId,
        items: _soloCerradas(leerSemanasGuardadas(userId)),
    }));
    const semanas = estado.uid === userId ? estado.items : _soloCerradas(leerSemanasGuardadas(userId));
    const fila = useRef(null);

    useEffect(() => {
        if (!userId) return undefined;
        let vivo = true;
        pedirSemanas(userId, undefined, { force: version > 0 })
            .then((l) => {
                if (!vivo || !Array.isArray(l)) return;
                const cerradas = l.filter((s) => s.cerrada);
                setEstado((prev) => {
                    const prevItems = prev.uid === userId ? prev.items : _soloCerradas(leerSemanasGuardadas(userId));
                    if (prev.uid === userId && _mismasSemanas(prevItems, cerradas)) return prev;
                    return { uid: userId, items: cerradas };
                });
            })
            .catch(() => {});
        return () => { vivo = false; };
    }, [userId, version]);

    // la más reciente a la vista antes del primer pintado (sin salto visual al entrar)
    const claveScroll = (semanas || []).map((s) => s.numero).join(',');
    useIsomorphicLayoutEffect(() => {
        if (fila.current && claveScroll) fila.current.scrollLeft = fila.current.scrollWidth;
    }, [claveScroll]);

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
                        aria-label={`${t('Semana {n}', { n: s.numero })}: ${tn(s.estrellas, '{n} estrella', '{n} estrellas', { n: s.estrellas })}, ${Number.isFinite(Number(s.puntos)) ? t('{n} pts', { n: formatNumber(s.puntos) }) : t('{n} de {total} días en meta', { n: s.dias_en_meta, total: 7 })}`}
                    >
                        <span className={styles.numero}>{t('S{n}', { n: s.numero })}</span>
                        <span className={styles.estrellas} aria-hidden="true">
                            {[0, 1, 2].map((i) => (
                                <Star key={i} size={11} strokeWidth={2.5} className={i < s.estrellas ? styles.ganada : styles.vacia} />
                            ))}
                        </span>
                        {Number.isFinite(Number(s.puntos)) && (
                            <span className={styles.puntos} aria-hidden="true">{t('{n} pts', { n: formatNumber(s.puntos) })}</span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

VitrinaDeSemanas.propTypes = {
    userId: PropTypes.string,
    onElegir: PropTypes.func,
    version: PropTypes.number,
};

export default VitrinaDeSemanas;
