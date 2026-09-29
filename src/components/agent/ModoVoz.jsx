// [P1-PLAN-LOTE-682 · 2026-09-28] La pantalla del modo voz: un círculo que escucha, piensa y habla.
//
// Pantalla completa y en un portal a `body`: dentro del chat, cualquier ancestro con `transform`/`backdrop-filter`
// convertiría el `fixed` en relativo a él (la lección del lote 415). Lo que se ve dice en todo momento de quién es el
// turno — la frase del usuario mientras habla, la del coach mientras suena — porque sin eso la voz es una caja negra;
// y la conversación entera queda además escrita en el chat al cerrar.
//
// [P1-PLAN-LOTE-688 · 2026-09-29] …y se MINIMIZA a una burbuja. El dueño: «quiero que se pueda mover dentro de la app
// mientras el modo voz esté activo: si le digo que me comí 2 huevos con pan integral y me pregunta cuántas lonjas,
// cuando lo agregue lo pueda ver en directo cómo sube el contador». No hace falta mover la conversación: el chat sigue
// montado (oculto) al cambiar de pestaña (App.jsx, `hasVisitedAgent`) y este portal vive en `body`, fuera de su `inert`.
// Minimizada no es un diálogo: ni `aria-modal`, ni foco robado, ni scroll bloqueado, ni Escape — la app es usable.
//
// El estado lo lleva `hooks/useConversacionPorVoz.js`; este componente solo lo pinta y le pasa los toques.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Maximize2, X } from 'lucide-react';
import { useT } from '../../i18n';
import styles from './ModoVoz.module.css';
import { useBurbujaArrastrable } from '../../hooks/useBurbujaArrastrable';

export default function ModoVoz({
    estado, oido, dicho, error, pulso = 0, estadoDelTurno, onTocar, onCerrar,
    minimizado = false, onMinimizar, onExpandir, enChat = false, pistaBurbuja = '',
}) {
    const t = useT();
    const capaRef = useRef(null);
    // [P1-PLAN-LOTE-906] se lleva con el dedo y se pega al borde (desestructurado: la regla de refs de React no deja
    // leer propiedades de un objeto que parece un ref durante el render).
    const { alMontar: montarBurbuja, estilo: estiloBurbuja, lado: ladoBurbuja, arrastrando, manejadores: manejadoresBurbuja } = useBurbujaArrastrable();
    const cerrarRef = useRef(onCerrar);
    useEffect(() => { cerrarRef.current = onCerrar; });

    useEffect(() => {
        if (minimizado) return undefined;   // la burbuja no es un diálogo: la app sigue siendo usable
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
    }, [minimizado]);

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

    const orbe = (clase) => (
        <button
            type="button"
            className={clase}
            data-estado={estado}
            data-latido={pulso % 2}
            onClick={onTocar}
            aria-label={etiquetaDelCirculo}
        >
            <span className={styles.halo} aria-hidden="true" />
            <span className={`${styles.halo} ${styles.halo2}`} aria-hidden="true" />
            <span className={styles.nucleo} aria-hidden="true" />
        </button>
    );

    if (minimizado) {
        // En la pestaña del coach (`enChat`) la caja de escribir y sus atajos ocupan la franja de abajo: la burbuja sube.
        // `pistaBurbuja`: la primera vez, que se puede mover por la app — hasta que hay algo que decir (lo suyo o lo del coach)
        const bocadillo = error ? t(error) : (subtitulo || pistaBurbuja || lineaDeEstado);
        // [P1-PLAN-LOTE-906] El globo se desvanece solo a los pocos segundos (una animación por texto: `key`), salvo
        // mientras el coach habla o hay un error: no tapa lo de debajo más de lo que hace falta.
        const globoFijo = Boolean(error) || estado === 'hablando';
        return createPortal(
            <div
                ref={montarBurbuja}
                className={styles.burbuja}
                style={estiloBurbuja}
                data-en-chat={enChat ? '1' : '0'}
                data-lado={ladoBurbuja || undefined}
                data-arrastrando={arrastrando ? '1' : '0'}
                role="region"
                aria-label={t('Modo voz')}
            >
                <p
                    key={bocadillo}
                    className={error ? `${styles.bocadillo} ${styles.estadoError}` : styles.bocadillo}
                    data-fijo={globoFijo ? '1' : '0'}
                    aria-live="polite"
                >
                    {bocadillo}
                </p>
                <div className={styles.burbujaFila} {...manejadoresBurbuja}>
                    <button type="button" className={styles.burbujaAccion} onClick={onExpandir} aria-label={t('Abrir el modo voz')}>
                        <Maximize2 size={14} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                    {orbe(`${styles.orbe} ${styles.orbeMini}`)}
                    <button type="button" className={styles.burbujaAccion} onClick={onCerrar} aria-label={t('Terminar el modo voz')}>
                        <X size={14} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                </div>
            </div>,
            document.body,
        );
    }

    return createPortal(
        <div ref={capaRef} tabIndex={-1} className={styles.capa} role="dialog" aria-modal="true" aria-labelledby="modo-voz-titulo">
            <div className={styles.fondo} aria-hidden="true" />
            <div className={styles.cabecera}>
                <span id="modo-voz-titulo" className={styles.titulo}>{t('Modo voz')}</span>
                <div className={styles.cabeceraAcciones}>
                    {onMinimizar && (
                        <button type="button" className={styles.cerrar} onClick={onMinimizar} aria-label={t('Minimizar el modo voz')}>
                            <ChevronDown size={22} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                    )}
                    <button type="button" className={styles.cerrar} onClick={onCerrar} aria-label={t('Terminar el modo voz')}>
                        <X size={22} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div className={styles.centro}>
                {orbe(styles.orbe)}

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
