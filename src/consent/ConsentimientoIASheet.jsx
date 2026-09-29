// [P1-PLAN-LOTE-844 · 2026-09-29] La hoja «Tus datos y la IA»: nombra a cada IA de terceros, qué recibe y para qué,
// avisa de la transferencia a China y pide el permiso con DOS casillas obligatorias (salud + IA; China) y una
// opcional de analítica, DESMARCADA. Sin casilla marcada de antemano ni «al continuar aceptas…»: es una acción
// afirmativa (App Review 5.1.2(i); RGPD arts. 7, 9.2.a y 49.1.a). Lleva además la línea médica (§A.4.1).
//
// Centrada en escritorio, hoja inferior en móvil; el cuerpo desplaza y los botones quedan fijos abajo. El fondo NO
// cierra: el permiso se decide con un botón («Ahora no» o Escape también valen como «no»). Accesibilidad con
// `useModalAccessibility` (foco atrapado, foco de vuelta, fondo sin scroll). Portal a <body>: fuera de cualquier
// contenedor con `isolation`/`transform` (lote 415), por encima de todo (`--z-modal-top`).
// `ph-no-capture`: la analítica no graba nada de lo que se toca aquí (lote 842), aunque el autocapture ya vaya apagado.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { AlertTriangle, HeartPulse, ShieldCheck } from 'lucide-react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { useT } from '../i18n';
import { apexUrl } from '../config/site';
import { VERSION_ANTIGUA } from './apiConsentimiento';
import { huellaDelTexto, textoDeLaHoja, textoPlanoDeLaHoja } from './textoDeLaHoja';
import styles from './ConsentimientoIASheet.module.css';

export default function ConsentimientoIASheet({ onAceptar, onRechazar }) {
    const t = useT();
    const tx = useMemo(() => textoDeLaHoja(t), [t]);
    const [casillaIA, setCasillaIA] = useState(false);
    const [casillaChina, setCasillaChina] = useState(false);
    const [analitica, setAnalitica] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);
    const idTitulo = useId();
    const idIntro = useId();
    const idPista = useId();
    const puedeAceptar = casillaIA && casillaChina;

    // Estable (lee `guardando` por ref): si cambiara de identidad al guardar, `useModalAccessibility` reharía su efecto
    // y el foco saltaría fuera de la hoja y volvería.
    const guardandoRef = useRef(false);
    useEffect(() => { guardandoRef.current = guardando; }, [guardando]);
    const rechazar = useCallback(() => {
        if (!guardandoRef.current) onRechazar();
    }, [onRechazar]);

    const { containerRef } = useModalAccessibility({ isOpen: true, onClose: rechazar });

    // Escape lo atiende SOLO esta hoja (captura en window + stopPropagation). Abierta encima de otro modal —el
    // escáner, el bot de ayuda, Configuración— el Escape de ESE también saltaba y cerraba lo que la persona hacía.
    useEffect(() => {
        const alPulsar = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            e.preventDefault();
            rechazar();
        };
        window.addEventListener('keydown', alPulsar, true);
        return () => window.removeEventListener('keydown', alPulsar, true);
    }, [rechazar]);

    const aceptar = async () => {
        if (!puedeAceptar || guardando) return;
        setGuardando(true);
        setError(null);
        const textoSha256 = await huellaDelTexto(textoPlanoDeLaHoja(tx));
        let r = null;
        try {
            r = await onAceptar({ analytics: analitica, textoSha256 });
        } catch {
            r = null;
        }
        if (r && r.ok) return; // el host cierra la hoja
        setGuardando(false);
        setError(r && r.codigo === VERSION_ANTIGUA
            ? t('Este aviso cambió. Cierra y vuelve a abrir la app para ver la versión nueva.')
            : t('No pudimos guardar tu permiso. Revisa tu conexión e inténtalo de nuevo.'));
    };

    const hoja = (
        <div className={`${styles.capa} ph-no-capture`}>
            <div className={styles.fondo} aria-hidden="true" />
            <section
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                aria-describedby={idIntro}
                tabIndex={-1}
                className={styles.hoja}
                data-testid="hoja-consentimiento-ia"
            >
                <header className={styles.cabecera}>
                    <span className={styles.icono} aria-hidden="true"><ShieldCheck size={20} strokeWidth={2.2} /></span>
                    <h2 id={idTitulo} className={styles.titulo}>{tx.titulo}</h2>
                </header>

                <div className={styles.cuerpo}>
                    <p id={idIntro} className={styles.intro}>{tx.intro}</p>

                    <ul className={styles.proveedores}>
                        {tx.proveedores.map((p) => (
                            <li key={p.nombre} className={styles.proveedor}>
                                <p className={styles.proveedorNombre}>
                                    <strong>{p.nombre}</strong>
                                    <span className={styles.proveedorDonde}>{p.donde}</span>
                                </p>
                                <p className={styles.proveedorRecibe}>{p.recibe}</p>
                                <p className={styles.proveedorPara}>{p.para}</p>
                            </li>
                        ))}
                    </ul>

                    <div className={styles.china} role="note">
                        <p className={styles.chinaTitulo}>
                            <AlertTriangle size={16} strokeWidth={2.2} aria-hidden="true" />
                            {tx.chinaTitulo}
                        </p>
                        <p className={styles.chinaTexto}>{tx.china}</p>
                    </div>

                    <fieldset className={styles.casillas} disabled={guardando}>
                        <legend className={styles.soloLector}>{tx.titulo}</legend>
                        <label className={styles.casilla}>
                            <input type="checkbox" checked={casillaIA} onChange={(e) => setCasillaIA(e.target.checked)} required />
                            <span>{tx.casillaIA}</span>
                        </label>
                        <label className={styles.casilla}>
                            <input type="checkbox" checked={casillaChina} onChange={(e) => setCasillaChina(e.target.checked)} required />
                            <span>{tx.casillaChina}</span>
                        </label>
                        <label className={`${styles.casilla} ${styles.casillaOpcional}`}>
                            <input type="checkbox" checked={analitica} onChange={(e) => setAnalitica(e.target.checked)} />
                            <span>
                                <span className={styles.opcional}>{tx.opcional}</span>
                                {tx.casillaAnalitica}
                            </span>
                        </label>
                    </fieldset>

                    <p className={styles.medico}>
                        <HeartPulse size={16} strokeWidth={2.2} aria-hidden="true" className={styles.medicoIcono} />
                        <span>{tx.medico}</span>
                    </p>

                    <p className={styles.pie}>
                        {tx.retirada}{' '}
                        <a href={apexUrl('/privacy')} target="_blank" rel="noopener noreferrer">{tx.politica}</a>
                        {' · '}
                        <a href={apexUrl('/ai-policy')} target="_blank" rel="noopener noreferrer">{tx.usoIA}</a>
                    </p>
                </div>

                <footer className={styles.acciones}>
                    {error && <p role="alert" className={styles.error}>{error}</p>}
                    {!puedeAceptar && !error && (
                        <p id={idPista} className={styles.pista}>{t('Marca las dos casillas obligatorias para continuar.')}</p>
                    )}
                    <div className={styles.botones}>
                        <button type="button" className={styles.ahoraNo} onClick={rechazar} disabled={guardando} data-hover="fantasma">
                            {t('Ahora no')}
                        </button>
                        <button
                            type="button"
                            className={styles.aceptar}
                            onClick={aceptar}
                            disabled={!puedeAceptar || guardando}
                            aria-describedby={!puedeAceptar && !error ? idPista : undefined}
                            data-hover="boton"
                        >
                            {guardando ? t('Guardando…') : t('Aceptar y continuar')}
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(hoja, document.body) : hoja;
}

ConsentimientoIASheet.propTypes = {
    onAceptar: PropTypes.func.isRequired,
    onRechazar: PropTypes.func.isRequired,
};
