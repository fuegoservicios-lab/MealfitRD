// [P1-PLAN-LOTE-322 · 2026-09-25] Las dudas de la foto con sus respuestas de un toque. La usan el escáner (aplica la
// opción al plato al instante) y el chat (la envía como respuesta al coach). Una duda ya confirmada se encoge a una
// línea («✓ 4 huevos») con «Cambiar».
// [P1-PLAN-LOTE-347 · 2026-09-26] «Otra…» cuando ninguna opción encaja: con campo (escáner: escribir y «Recalcular»,
// que re-analiza la foto con lo escrito) o sin él (chat: el cursor va a la caja de escribir).
// [P1-PLAN-LOTE-360 · 2026-09-26] El dueño: «que se guarde en automático». Sin botón: recalcula al TERMINAR de escribir
// (Intro/«Listo» del teclado, o al salir del campo), nunca a media palabra — un análisis por letra gastaría de más. Y
// el campo se centra a la vista al abrirse: con el teclado arriba, la hoja lo dejaba tapado bajo el pie.
import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useT } from '../../i18n';
import styles from './DudasDeLaFoto.module.css';

// [P1-PLAN-LOTE-763 · 2026-09-28] `grande`: botones del tamaño de una tecla (el panel del chat que ocupa el sitio del
// teclado). `centrarCampo={false}`: el chat no centra el campo de «Otra…» — vive en la caja de escribir, que ya sube con
// el teclado, y un `scrollIntoView` ahí desplazaría la página entera bajo el teclado de iOS.
// `pistaOtra`: el texto guía del campo (en el panel, más estrecho, el del escáner se cortaba).
const DudasDeLaFoto = ({ dudas, respuestas, confirmadas, onElegir, bloqueado = false, onOtra = null, otraConCampo = false, calculando = null, onEditando = null, grande = false, centrarCampo = true, pistaOtra = null }) => {
    const t = useT();
    const [reabiertas, setReabiertas] = useState({});
    const [otraAbierta, setOtraAbierta] = useState(null);
    const [otraTexto, setOtraTexto] = useState('');
    const campoRef = useRef(null);
    useEffect(() => {
        if (!otraConCampo || !centrarCampo || otraAbierta === null) return undefined;
        // tras la subida del teclado (~0,4 s en iOS): antes la hoja subía de más y el campo quedaba tapado
        const reloj = setTimeout(() => campoRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 350);
        return () => clearTimeout(reloj);
    }, [otraAbierta, otraConCampo, centrarCampo]);
    // [P1-PLAN-LOTE-362] el escáner esconde «Volver a escanear» mientras se escribe o se calcula: parecía el botón de
    // guardar la respuesta
    const editando = otraAbierta !== null || calculando !== null;
    useEffect(() => { onEditando?.(editando); }, [editando, onEditando]);
    useEffect(() => () => { onEditando?.(false); }, [onEditando]);   // si el bloque desaparece, el botón vuelve
    // [P1-PLAN-LOTE-763] Qué campo está abierto, sin esperar al render: el blur de un campo que se desmonta (o el que
    // llega pegado a un Intro) trae la clausura vieja, y con el estado solo podía mandar lo escrito dos veces.
    const otraAbiertaRef = useRef(null);
    const cerrarOtra = () => {
        otraAbiertaRef.current = null;
        setOtraAbierta(null);
        setOtraTexto('');
    };
    const tocarOtra = (i) => {
        if (!otraConCampo) { onOtra(i); return; }
        otraAbiertaRef.current = i;
        setOtraAbierta(i);
        setOtraTexto('');
    };
    const enviarOtra = (i) => {
        const texto = otraTexto.trim();
        if (otraAbiertaRef.current !== i || !texto) return;   // Intro y luego el blur del mismo campo: una sola vez
        cerrarOtra();
        onOtra(i, texto);
    };
    // [763] Tocar una opción con «Otra…» abierto: si es de OTRA duda, lo escrito se aplica antes (en el iPhone tocar un
    // botón no quita el foco al campo, así que el «tocar fuera» no llegaba); si es de la MISMA, gana el toque.
    const tocarOpcion = (i, j) => {
        const abierta = otraAbiertaRef.current;
        if (abierta === i) cerrarOtra();
        else if (abierta !== null) enviarOtra(abierta);
        setReabiertas((r) => ({ ...r, [i]: false }));
        onElegir(i, j);
    };
    return (
        <ul className={grande ? `${styles.lista} ${styles.grande}` : styles.lista}>
            {dudas.map((d, i) => {
                const elegida = respuestas?.[i];
                const cerrada = confirmadas?.[i] && !reabiertas[i] && d.opciones[elegida];
                if (cerrada) {
                    const texto = d.opciones[elegida].texto_mostrar || d.opciones[elegida].texto;   // [P1-PLAN-LOTE-626]
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
                // [P1-PLAN-LOTE-361] mientras se calcula lo escrito, SOLO esta duda espera; las demás siguen tocables
                const esperando = calculando === i;
                return (
                    <li key={d.pregunta} className={styles.duda}>
                        <span className={styles.pregunta}>{d.pregunta}</span>
                        {esperando && <span role="status" className={styles.calculando}>{t('Calculando…')}</span>}
                        {(d.opciones.length > 0 || onOtra) && (
                            <div className={styles.opciones} role="group" aria-label={d.pregunta}>
                                {d.opciones.map((o, j) => (
                                    <button
                                        key={`${j}-${o.texto}`}
                                        type="button"
                                        className={`${styles.opcion} ${elegida === j ? styles.elegida : ''}`}
                                        aria-pressed={elegida === j}
                                        disabled={bloqueado || esperando}
                                        onClick={() => tocarOpcion(i, j)}
                                    >
                                        {o.texto_mostrar || o.texto}
                                    </button>
                                ))}
                                {onOtra && (
                                    <button
                                        type="button"
                                        className={`${styles.opcion} ${styles.otra} ${otraAbierta === i ? styles.elegida : ''}`}
                                        aria-expanded={otraConCampo ? otraAbierta === i : undefined}
                                        disabled={bloqueado || esperando}
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
                                    ref={campoRef}
                                    type="text"
                                    className={styles.otraInput}
                                    value={otraTexto}
                                    maxLength={200}
                                    autoFocus
                                    enterKeyHint="done"
                                    disabled={bloqueado}
                                    aria-label={t('Tu respuesta: {x}', { x: d.pregunta })}
                                    placeholder={pistaOtra || t('Escríbelo: ej. 4 huevos con queso')}
                                    onChange={(e) => setOtraTexto(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enviarOtra(i); } }}
                                    onBlur={() => enviarOtra(i)}
                                />
                                {/* [P1-PLAN-LOTE-362] un ✓ explícito: deja claro cómo se guarda (Intro y tocar fuera siguen valiendo) */}
                                <button
                                    type="button"
                                    className={styles.aplicar}
                                    aria-label={t('Aplicar')}
                                    disabled={bloqueado || !otraTexto.trim()}
                                    onPointerDown={(e) => e.preventDefault()}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => enviarOtra(i)}
                                >
                                    ✓
                                </button>
                            </div>
                        )}
                        {otraConCampo && otraAbierta === i && (
                            <span className={styles.otraAyuda}>{t('Se aplica al tocar ✓, pulsar Intro o tocar fuera.')}</span>
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
    calculando: PropTypes.number,
    onEditando: PropTypes.func,
    grande: PropTypes.bool,
    centrarCampo: PropTypes.bool,
    pistaOtra: PropTypes.string,
};

export default DudasDeLaFoto;
