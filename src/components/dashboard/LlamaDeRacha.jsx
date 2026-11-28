// [P1-PLAN-LOTE-1161 · 2026-11-22] La llama de la racha: días seguidos registrando, el multiplicador que dan y los
// escudos guardados. La llama crece y cambia de tono por tramo (×1,2 · ×1,5 · ×1,75 · ×2); sin racha, apagada.
import PropTypes from 'prop-types';
import { Flame, Shield } from 'lucide-react';
import { formatNumber, useT, useTn } from '../../i18n';
import styles from './PuntosDeHoy.module.css';

const LlamaDeRacha = ({ racha = 0, tramo, escudos = 0, escudosMax = 2, onAbrir = null }) => {
    const t = useT();
    const tn = useTn();
    const mult = formatNumber(tramo?.mult || 1, { maximumFractionDigits: 2 });
    const etiqueta = [
        tn(racha, '{n} día seguido registrando', '{n} días seguidos registrando', { n: racha }),
        t('multiplicador ×{m}', { m: mult }),
        tn(escudos, '{n} escudo de racha', '{n} escudos de racha', { n: escudos }),
    ].join(', ');
    const Contenedor = onAbrir ? 'button' : 'div';
    return (
        <Contenedor
            {...(onAbrir ? { type: 'button', onClick: onAbrir, 'aria-haspopup': 'dialog' } : { role: 'img' })}
            className={`${styles.llama} ${styles[`tramo_${tramo?.clave || 'ninguno'}`] || ''}`}
            aria-label={etiqueta}
            title={etiqueta}
        >
            <span className={styles.llamaTop} aria-hidden="true">
                <span className={styles.fuego}>
                    <Flame size={16} strokeWidth={2.25} />
                </span>
                <span className={styles.llamaInfo}>
                    <span className={styles.llamaEtiqueta}>{t('Racha')}</span>
                    <span className={styles.llamaTexto}>
                        <strong className={styles.llamaDias}>{formatNumber(racha)}</strong>
                        <span className={styles.llamaUnidad}>{tn(racha, 'día', 'días', { n: racha })}</span>
                    </span>
                </span>
            </span>
            <span className={styles.llamaPie} aria-hidden="true">
                <span className={styles.mult}>×{mult}</span>
                <span className={styles.escudos}>
                    {Array.from({ length: escudosMax }, (_, i) => (
                        <Shield
                            key={i}
                            size={12}
                            strokeWidth={2.5}
                            className={i < escudos ? styles.escudoLleno : styles.escudoVacio}
                        />
                    ))}
                    <span className={styles.escudosCuenta}>{escudos}/{escudosMax}</span>
                </span>
            </span>
        </Contenedor>
    );
};

LlamaDeRacha.propTypes = {
    racha: PropTypes.number,
    tramo: PropTypes.shape({ mult: PropTypes.number, clave: PropTypes.string }),
    escudos: PropTypes.number,
    escudosMax: PropTypes.number,
    onAbrir: PropTypes.func,
};

export default LlamaDeRacha;
