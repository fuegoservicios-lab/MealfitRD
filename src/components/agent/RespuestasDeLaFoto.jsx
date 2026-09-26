// [P1-PLAN-LOTE-322 · 2026-09-25] En el chat, las dudas de la foto con respuestas de UN toque bajo la respuesta del
// coach. Se elige una opción por duda y, en cuanto están todas, se envía UN solo mensaje («4 huevos · Arepa»): un
// turno del coach (y un mensaje del cupo mensual), no uno por duda. El coach corrige el registro con esa respuesta.
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useT } from '../../i18n';
import DudasDeLaFoto from '../common/DudasDeLaFoto';
import { mensajeDeRespuestas } from '../../utils/dudasDeLaFoto';

const RespuestasDeLaFoto = ({ dudas, onEnviar, onOtra = null }) => {
    const t = useT();
    const [elegidas, setElegidas] = useState({});
    const elegir = (i, j) => {
        const nuevas = { ...elegidas, [i]: j };
        setElegidas(nuevas);
        if (dudas.every((_, k) => nuevas[k] !== undefined)) onEnviar(mensajeDeRespuestas(dudas, nuevas));
    };
    return (
        <div className="chat-respuestas-foto" role="group" aria-label={t('Responde con un toque')}>
            <span className="chat-respuestas-foto-titulo">{t('Responde con un toque:')}</span>
            {/* [P1-PLAN-LOTE-347] «Otra…»: el cursor a la caja de escribir, con la pregunta como pista */}
            <DudasDeLaFoto dudas={dudas} respuestas={elegidas} confirmadas={{}} onElegir={elegir}
                onOtra={onOtra ? (i) => onOtra(dudas[i].pregunta) : null} />
        </div>
    );
};

RespuestasDeLaFoto.propTypes = {
    dudas: PropTypes.array.isRequired,
    onEnviar: PropTypes.func.isRequired,
    onOtra: PropTypes.func,
};

export default RespuestasDeLaFoto;
