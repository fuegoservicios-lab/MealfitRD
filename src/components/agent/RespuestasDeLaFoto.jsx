// [P1-PLAN-LOTE-322 · 2026-09-25] En el chat, las dudas de la foto con respuestas de UN toque bajo la respuesta del
// coach. Se elige una opción por duda y, en cuanto están todas, se envía UN solo mensaje («4 huevos · Arepa»): un
// turno del coach (y un mensaje del cupo mensual), no uno por duda. El coach corrige el registro con esa respuesta.
// [P1-PLAN-LOTE-690 · 2026-09-28] Ahora salen ANTES de que hable el coach: el turno espera a las respuestas. Junto al
// texto viaja cuánto cambian el plato (`ajuste`), y «Omitir» se queda con lo que supuso la IA.
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useT } from '../../i18n';
import DudasDeLaFoto from '../common/DudasDeLaFoto';
import { eleccionesSupuestas, respuestasElegidas } from '../../utils/fotoAntesDelCoach';

const RespuestasDeLaFoto = ({ dudas, onEnviar, onOtra = null, titulo = null, onOmitir = null, onParcial = null }) => {
    const t = useT();
    const [elegidas, setElegidas] = useState({});
    const elegir = (i, j) => {
        const nuevas = { ...elegidas, [i]: j };
        setElegidas(nuevas);
        if (onParcial) onParcial(nuevas);   // [P1-PLAN-LOTE-695] lo tocado, por si luego escribe la otra
        if (dudas.every((_, k) => nuevas[k] !== undefined)) {
            const r = respuestasElegidas(dudas, nuevas);
            onEnviar(r.texto, r.ajuste);
        }
    };
    const omitir = () => {
        const r = respuestasElegidas(dudas, eleccionesSupuestas(dudas));
        onOmitir(r.texto, r.ajuste);
    };
    return (
        <div className="chat-respuestas-foto" role="group" aria-label={t('Responde con un toque')}>
            <span className="chat-respuestas-foto-titulo">{titulo || t('Responde con un toque:')}</span>
            {/* [P1-PLAN-LOTE-347] «Otra…»: el cursor a la caja de escribir, con la pregunta como pista */}
            <DudasDeLaFoto dudas={dudas} respuestas={elegidas} confirmadas={{}} onElegir={elegir}
                onOtra={onOtra ? (i) => onOtra(dudas[i].pregunta) : null} />
            {onOmitir && (
                <button type="button" className="chat-respuestas-foto-omitir" onClick={omitir}>
                    {t('Omitir preguntas')}
                </button>
            )}
        </div>
    );
};

RespuestasDeLaFoto.propTypes = {
    dudas: PropTypes.array.isRequired,
    onEnviar: PropTypes.func.isRequired,
    onOtra: PropTypes.func,
    titulo: PropTypes.string,
    onOmitir: PropTypes.func,
    onParcial: PropTypes.func,
};

export default RespuestasDeLaFoto;
