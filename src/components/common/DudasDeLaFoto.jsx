// [P1-PLAN-LOTE-322 · 2026-09-25] Las dudas de la foto con sus respuestas de un toque. La usan el escáner (aplica la
// opción al plato al instante) y el chat (la envía como respuesta al coach). Una duda ya confirmada se encoge a una
// línea («✓ 4 huevos») con «Cambiar».
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useT } from '../../i18n';
import styles from './DudasDeLaFoto.module.css';

const DudasDeLaFoto = ({ dudas, respuestas, confirmadas, onElegir, bloqueado = false }) => {
    const t = useT();
    const [reabiertas, setReabiertas] = useState({});
    return (
        <ul className={styles.lista}>
            {dudas.map((d, i) => {
                const elegida = respuestas?.[i];
                const cerrada = confirmadas?.[i] && !reabiertas[i] && d.opciones[elegida];
                if (cerrada) {
                    const texto = d.opciones[elegida].texto;
                    return (
                        <li key={d.pregunta} className={styles.cerrada}>
                            <span aria-hidden="true">✓</span> <span>{texto}</span>
                            <button
                                type="button"
                                className={styles.cambiar}
                                disabled={bloqueado}
                                aria-label={t('Cambiar: {x}', { x: texto })}
                                onClick={() => setReabiertas((r) => ({ ...r, [i]: true }))}
                            >
                                {t('Cambiar')}
                            </button>
                        </li>
                    );
                }
                return (
                    <li key={d.pregunta} className={styles.duda}>
                        <span className={styles.pregunta}>{d.pregunta}</span>
                        {d.opciones.length > 0 && (
                            <div className={styles.opciones} role="group" aria-label={d.pregunta}>
                                {d.opciones.map((o, j) => (
                                    <button
                                        key={o.texto}
                                        type="button"
                                        className={`${styles.opcion} ${elegida === j ? styles.elegida : ''}`}
                                        aria-pressed={elegida === j}
                                        disabled={bloqueado}
                                        onClick={() => { setReabiertas((r) => ({ ...r, [i]: false })); onElegir(i, j); }}
                                    >
                                        {o.texto}
                                    </button>
                                ))}
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

DudasDeLaFoto.propTypes = {
    dudas: PropTypes.arrayOf(PropTypes.shape({
        pregunta: PropTypes.string.isRequired,
        opciones: PropTypes.arrayOf(PropTypes.shape({ texto: PropTypes.string.isRequired })).isRequired,
    })).isRequired,
    respuestas: PropTypes.object,
    confirmadas: PropTypes.object,
    onElegir: PropTypes.func.isRequired,
    bloqueado: PropTypes.bool,
};

export default DudasDeLaFoto;
