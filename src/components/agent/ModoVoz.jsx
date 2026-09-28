// [P1-PLAN-LOTE-682 · 2026-09-28] La pantalla del modo voz: un círculo que escucha, piensa y habla.
//
// Pantalla completa y en un portal a `body`: dentro del chat, cualquier ancestro con `transform`/`backdrop-filter`
// convertiría el `fixed` en relativo a él (la lección del lote 415). Lo que se ve dice en todo momento de quién es el
// turno — la frase del usuario mientras habla, la del coach mientras suena — porque sin eso la voz es una caja negra;
// y la conversación entera queda además escrita en el chat al cerrar.
//
// El estado lo lleva `hooks/useConversacionPorVoz.js`; este componente solo lo pinta y le pasa los toques.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from '../../i18n';
import styles from './ModoVoz.module.css';

export default function ModoVoz({ estado, oido, dicho, error, pulso = 0, estadoDelTurno, onTocar, onCerrar }) {
    const t = useT();
    const capaRef = useRef(null);
    const cerrarRef = useRef(onCerrar);
    useEffect(() => { cerrarRef.current = onCerrar; });

    useEffect(() => {
        // El foco va al diálogo (lo anuncia el lector de pantalla), no al círculo: en él se pintaría el anillo de foco.
        try { capaRef.current?.focus({ preventScroll: true }); } catch { /* sin foco programático */ }
        const alTeclado = (e) => { if (e.key === 'Escape') cerrarRef.current?.(); };
        window.addEventListener('keydown', alTeclado);
        const antes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', alTeclado);
            document.body.style.overflow = antes;
        };
    }, []);

    let lineaDeEstado;
    let etiquetaDelCirculo;
    if (estado === 'escuchando') {
        lineaDeEstado = t('Te escucho…');
        etiquetaDelCirculo = t('Terminar de hablar');
    } else if (estado === 'pensando') {
        lineaDeEstado = estadoDelTurno || t('Pensando…');
        etiquetaDelCirculo = t('Interrumpir al coach');
    } else if (estado === 'hablando') {
        lineaDeEstado = t('Toca el círculo para interrumpir');
        etiquetaDelCirculo = t('Interrumpir al coach');
    } else {
        lineaDeEstado = t('Toca el círculo para hablar');
        etiquetaDelCirculo = t('Hablar');
    }

    const subtitulo = estado === 'hablando' ? dicho : oido;
    const pista = !subtitulo && (estado === 'escuchando' || estado === 'pausa')
        ? t('Cuéntame qué comiste o pregúntame lo que quieras')
        : '';

    return createPortal(
        <div ref={capaRef} tabIndex={-1} className={styles.capa} role="dialog" aria-modal="true" aria-labelledby="modo-voz-titulo">
            <div className={styles.fondo} aria-hidden="true" />
            <div className={styles.cabecera}>
                <span id="modo-voz-titulo" className={styles.titulo}>{t('Modo voz')}</span>
                <button type="button" className={styles.cerrar} onClick={onCerrar} aria-label={t('Terminar el modo voz')}>
                    <X size={22} strokeWidth={2.2} aria-hidden="true" />
                </button>
            </div>

            <div className={styles.centro}>
                <button
                    type="button"
                    className={styles.orbe}
                    data-estado={estado}
                    data-latido={pulso % 2}
                    onClick={onTocar}
                    aria-label={etiquetaDelCirculo}
                >
                    <span className={styles.halo} aria-hidden="true" />
                    <span className={`${styles.halo} ${styles.halo2}`} aria-hidden="true" />
                    <span className={styles.nucleo} aria-hidden="true" />
                </button>

                <p className={error ? `${styles.estado} ${styles.estadoError}` : styles.estado} aria-live="polite">
                    {error ? t(error) : lineaDeEstado}
                </p>
                <p className={styles.subtitulo} aria-live="polite">
                    {subtitulo || <span className={styles.pista}>{pista}</span>}
                </p>
            </div>

            <div className={styles.pie}>
                <button type="button" className={styles.terminar} onClick={onCerrar}>{t('Terminar')}</button>
            </div>
        </div>,
        document.body,
    );
}
