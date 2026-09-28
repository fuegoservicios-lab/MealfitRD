// [P1-PLAN-LOTE-322 · 2026-09-25] En el chat, las dudas de la foto con respuestas de UN toque bajo la respuesta del
// coach. Se elige una opción por duda y, en cuanto están todas, se envía UN solo mensaje («4 huevos · Arepa»): un
// turno del coach (y un mensaje del cupo mensual), no uno por duda. El coach corrige el registro con esa respuesta.
// [P1-PLAN-LOTE-690 · 2026-09-28] Ahora salen ANTES de que hable el coach: el turno espera a las respuestas. Junto al
// texto viaja cuánto cambian el plato (`ajuste`), y «Omitir» se queda con lo que supuso la IA.
// [P1-PLAN-LOTE-763 · 2026-09-28] `enPanel`: en el teléfono la pregunta obligatoria ocupa el sitio de la caja de
// escribir, con el teclado cerrado (el dueño: «que se vea donde está el teclado»). Sin caja a la vista, «Otra…» abre un
// campo AQUÍ, en su duda, y lo escrito cuenta como la respuesta de esa duda (se ve como una opción más, marcada).
import React, { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useT } from '../../i18n';
import DudasDeLaFoto from '../common/DudasDeLaFoto';
import { eleccionesSupuestas, respuestasConEscritas, respuestasElegidas } from '../../utils/fotoAntesDelCoach';

const RespuestasDeLaFoto = ({ dudas, onEnviar, onOtra = null, titulo = null, onOmitir = null, onParcial = null, enPanel = false }) => {
    const t = useT();
    const [elegidas, setElegidas] = useState({});
    const [escritas, setEscritas] = useState({});
    // lo último elegido/escrito, sin esperar al render: tocar una opción con el campo de «Otra…» abierto dispara
    // primero el blur del campo (guarda lo escrito) y después el toque
    const vigenteRef = useRef({ elegidas: {}, escritas: {} });
    const enviadoRef = useRef(false);   // el panel manda UNA vez (Intro y el blur del mismo campo)
    const aplicar = (nuevas, nuevasEscritas) => {
        vigenteRef.current = { elegidas: nuevas, escritas: nuevasEscritas };
        setElegidas(nuevas);
        setEscritas(nuevasEscritas);
        if (onParcial) onParcial(nuevas);   // [P1-PLAN-LOTE-695] lo tocado, por si luego escribe en la caja
        const completas = dudas.every((_, k) => nuevas[k] !== undefined || nuevasEscritas[k]);
        if (!completas || (enPanel && enviadoRef.current)) return;
        enviadoRef.current = true;
        const r = respuestasConEscritas(dudas, nuevas, nuevasEscritas);
        onEnviar(r.texto, r.ajuste);
    };
    const elegir = (i, j) => {
        const { elegidas: antes, escritas: escritasAntes } = vigenteRef.current;
        if (j >= dudas[i].opciones.length) return;   // [763] tocar lo ya escrito: sigue siendo la respuesta
        const sinEscrita = { ...escritasAntes };
        delete sinEscrita[i];
        aplicar({ ...antes, [i]: j }, sinEscrita);
    };
    const escribir = (i, texto) => {
        const { elegidas: antes, escritas: escritasAntes } = vigenteRef.current;
        const sinElegida = { ...antes };
        delete sinElegida[i];
        aplicar(sinElegida, { ...escritasAntes, [i]: texto });
    };
    const omitir = () => {
        const r = respuestasElegidas(dudas, eleccionesSupuestas(dudas));
        onOmitir(r.texto, r.ajuste);
    };
    // [763] lo escrito se pinta como una opción más, marcada, al final de su duda
    const dudasVista = enPanel
        ? dudas.map((d, i) => (escritas[i] ? { ...d, opciones: [...d.opciones, { texto: escritas[i] }] } : d))
        : dudas;
    const respuestasVista = { ...elegidas };
    Object.keys(escritas).forEach((i) => { if (escritas[i]) respuestasVista[i] = dudas[i].opciones.length; });
    let otra = null;
    if (enPanel) otra = escribir;
    else if (onOtra) otra = (i) => onOtra(dudas[i].pregunta);   // [P1-PLAN-LOTE-347] el cursor a la caja de escribir
    return (
        <div className={enPanel ? 'chat-respuestas-foto chat-dudas-panel' : 'chat-respuestas-foto'}
            role="group" aria-label={t('Responde con un toque')}>
            <span className="chat-respuestas-foto-titulo">{titulo || t('Responde con un toque:')}</span>
            <DudasDeLaFoto dudas={dudasVista} respuestas={respuestasVista} confirmadas={{}} onElegir={elegir}
                onOtra={otra} otraConCampo={enPanel} grande={enPanel} centrarCampo={!enPanel}
                pistaOtra={enPanel ? t('Escribe tu respuesta') : null} />
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
    enPanel: PropTypes.bool,
};

export default RespuestasDeLaFoto;
