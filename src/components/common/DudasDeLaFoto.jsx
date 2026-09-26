// [P1-PLAN-LOTE-322 · 2026-09-25] Las dudas de la foto con sus respuestas de un toque. La usan el escáner (aplica la
// opción al plato al instante) y el chat (la envía como respuesta al coach). Una duda ya confirmada se encoge a una
// línea («✓ 4 huevos») con «Cambiar».
// [P1-PLAN-LOTE-347 · 2026-09-26] «Otra…» cuando ninguna opción encaja: con campo (escáner: escribir y «Recalcular»,
// que re-analiza la foto con lo escrito) o sin él (chat: el cursor va a la caja de escribir).
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useT } from '../../i18n';
import styles from './DudasDeLaFoto.module.css';

const DudasDeLaFoto = ({ dudas, respuestas, confirmadas, onElegir, bloqueado = false, onOtra = null, otraConCampo = false }) => {
    const t = useT();
    const [reabiertas, setReabiertas] = useState({});
    const [otraAbierta, setOtraAbierta] = useState(null);
    const [otraTexto, setOtraTexto] = useState('');
    const tocarOtra = (i) => {
        if (!otraConCampo) { onOtra(i); return; }
        setOtraAbierta(i);
        setOtraTexto('');
    };
    const enviarOtra = (i) => {
        const texto = otraTexto.trim();
        if (!texto) return;
        setOtraAbierta(null);
        onOtra(i, texto);
    };
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
                        {(d.opciones.length > 0 || onOtra) && (
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
                                {onOtra && (
                                    <button
                                        type="button"
                                        className={`${styles.opcion} ${styles.otra} ${otraAbierta === i ? styles.elegida : ''}`}
                                        aria-expanded={otraConCampo ? otraAbierta === i : undefined}
                                        disabled={bloqueado}
                                        onClick={() => tocarOtra(i)}
                                    >
                                        {t('Otra…')}
                                    </button>
                                )}
                            </div>
                        )}
                        {otraConCampo && otraAbierta === i && (
                            <div className={styles.otraCampo}>
                                <input
                                    type="text"
                                    className={styles.otraInput}
                                    value={otraTexto}
                                    maxLength={200}
                                    autoFocus
                                    disabled={bloqueado}
                                    aria-label={t('Tu respuesta: {x}', { x: d.pregunta })}
                                    placeholder={t('Escríbelo: ej. 4 huevos con queso')}
                                    onChange={(e) => setOtraTexto(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enviarOtra(i); } }}
                                />
                                <button
                                    type="button"
                                    className={styles.recalcular}
                                    disabled={bloqueado || !otraTexto.trim()}
                                    onClick={() => enviarOtra(i)}
                                >
                                    {t('Recalcular')}
                                </button>
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
    onOtra: PropTypes.func,
    otraConCampo: PropTypes.bool,
};

export default DudasDeLaFoto;
