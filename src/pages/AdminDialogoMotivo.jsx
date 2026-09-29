// frontend/src/pages/AdminDialogoMotivo.jsx
// [P1-PLAN-LOTE-833 · 2026-09-29] El diálogo con motivo del panel para las cuentas de prueba (marcar una, marcar varias,
// quitar la marca y confirmar la vuelta de quien salió): el velo, el foco atrapado y ESC de los regalos
// (`useModalAccessibility`), el motivo obligatorio (3-300 caracteres) y, cuando hace falta, una casilla que confirma
// algo APARTE («La persona me pidió volver»). Quien lo abre decide qué pedir en `onEnviar(motivo)`: si lanza, el
// mensaje sale dentro del diálogo; si no, lo cierra él.
import { useCallback, useId, useRef, useState } from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import base from './AdminCuentas.module.css';
import styles from './AdminCuentasLista.module.css';

// [I18N-EXEMPT: panel interno del dueño, solo español]
const TEXTOS = {
    motivo: 'Motivo',
    motivoAyuda: 'Obligatorio. Queda anotado junto a la marca (p. ej., «tester del beta»). No escribas datos personales ni de salud.',
    cancelar: 'Cancelar',
    guardando: 'Guardando…',
    errorGenerico: 'No se pudo guardar; no se hizo ningún cambio.',
};

export default function AdminDialogoMotivo({ titulo, explicacion, lista, confirmacion, boton, motivoInicial = '', onEnviar, onCerrar }) {
    const idTitulo = useId();
    const idExplicacion = useId();
    const idMotivo = useId();
    const [motivo, setMotivo] = useState(motivoInicial);
    const [confirmado, setConfirmado] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const enviandoRef = useRef(false);

    // `onClose` ESTABLE a propósito: si cambiara en cada render, el hook rehace su efecto y devuelve el foco al disparador
    // (detrás del velo) en mitad del diálogo. Mientras se envía, ni ESC ni el velo cierran: se consulta la ref, no el
    // estado, para que el efecto del hook no se rehaga al empezar a enviar.
    const cerrar = useCallback(() => { if (!enviandoRef.current) onCerrar(); }, [onCerrar]);
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose: cerrar });

    const valido = motivo.trim().length >= 3 && (!confirmacion || confirmado);

    const enviar = async (e) => {
        e.preventDefault();
        if (!valido || enviandoRef.current) return;
        enviandoRef.current = true;
        setEnviando(true);
        setError('');
        try {
            await onEnviar(motivo.trim());
        } catch (err) {
            setError(err?.message || TEXTOS.errorGenerico);
        } finally {
            enviandoRef.current = false;
            setEnviando(false);
        }
    };

    return (
        <div className={base.velo} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
            <form
                ref={containerRef}
                className={base.dialogo}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                aria-describedby={explicacion ? idExplicacion : undefined}
                tabIndex={-1}
                onSubmit={enviar}
            >
                <h3 id={idTitulo} className={base.dialogoTitulo}>{titulo}</h3>
                {explicacion && <p id={idExplicacion} className={styles.explicacion}>{explicacion}</p>}
                {lista && lista.length > 0 && (
                    <ul className={styles.correosDialogo}>
                        {lista.map((texto) => <li key={texto}>{texto}</li>)}
                    </ul>
                )}
                <div className={base.campo}>
                    <label htmlFor={idMotivo} className={base.etiqueta}>{TEXTOS.motivo}</label>
                    <textarea
                        id={idMotivo}
                        className={base.input}
                        rows={2}
                        maxLength={300}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        aria-describedby={`${idMotivo}-ayuda`}
                    />
                    <span id={`${idMotivo}-ayuda`} className={base.ayuda}>{TEXTOS.motivoAyuda}</span>
                </div>
                {confirmacion && (
                    <label className={styles.confirmacion}>
                        <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
                        {confirmacion}
                    </label>
                )}
                {error && <p className={base.error} role="alert">{error}</p>}
                <div className={base.pie}>
                    <button type="button" className={base.boton} onClick={cerrar} disabled={enviando}>{TEXTOS.cancelar}</button>
                    {/* Ocupado = `aria-disabled` y no `disabled`: un botón con el foco que pasa a `disabled` lo suelta al
                        <body> y la trampa del hook deja de retenerlo (lección del lote 835). */}
                    <button type="submit" className={base.primario} disabled={!valido} aria-disabled={enviando || undefined}>
                        {enviando ? TEXTOS.guardando : boton}
                    </button>
                </div>
            </form>
        </div>
    );
}
