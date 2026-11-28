// frontend/src/pages/AdminDialogoEliminar.jsx
// [P1-PLAN-LOTE-1166 · 2026-11-22] Eliminar cuentas EN LOTE (petición del dueño con la barra de selección). Dos pasos:
// al abrir, `POST /api/admin/cuentas/eliminar/revisar` dice de cada cuenta su última actividad, lo que hizo y su
// bloqueo (admin, suscripción de pago viva). Las ACTIVAS (últimos 14 días) llevan su propia casilla y no se borran sin
// ella; el botón pide escribir «ELIMINAR». El 20-nov se borraron por error cuentas con gente activa: este diálogo
// existe para que eso no vuelva a pasar en un clic.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { fecha, pedirAdmin } from '../utils/adminCuentas';
import base from './AdminCuentas.module.css';
import styles from './AdminCuentasLista.module.css';

// [I18N-EXEMPT: panel interno del dueño, solo español]
const TEXTOS = {
    titulo: (n) => (n === 1 ? 'Eliminar 1 cuenta' : `Eliminar ${n} cuentas`),
    explicacion: 'Se borra TODO de cada cuenta (comidas, planes, chats, fotos y su acceso). No se puede deshacer.',
    revisando: 'Revisando las cuentas…',
    errorRevisar: 'No se pudieron revisar las cuentas; no se borró nada.',
    activa: 'Activa',
    sinActividad: 'Sin actividad',
    ultima: (f) => `Última actividad: ${f}`,
    numeros: (r) => `${r.comidas_total} comidas · ${r.mensajes_coach} mensajes · ${r.planes} planes`,
    confirmarActiva: 'Sí, borrar esta cuenta activa',
    bloqueo: {
        es_admin: 'Es admin: no se borra',
        suscripcion_activa: 'Tiene suscripción de pago: cancélala antes',
        no_existe: 'Ya no existe',
    },
    escribe: 'Escribe ELIMINAR para confirmar',
    cancelar: 'Cancelar',
    borrando: 'Eliminando…',
    boton: (n) => (n === 1 ? 'Eliminar 1 cuenta' : `Eliminar ${n} cuentas`),
    nada: 'Ninguna de estas cuentas se puede borrar.',
    errores: {
        confirmacion: 'El texto de confirmación no coincide.',
        demasiadas: 'Son demasiadas a la vez: como mucho 25.',
        sin_rastro: 'No se pudo anotar el borrado en el registro; se detuvo el lote.',
    },
    errorGenerico: 'No se pudo completar el borrado. Revisa la lista: lo ya borrado no vuelve.',
};

export default function AdminDialogoEliminar({ ids: idsDeFuera, onTerminar, onCerrar }) {
    // la selección se congela al abrir: un array nuevo en cada render del padre no debe repetir la revisión
    const [ids] = useState(() => [...idsDeFuera]);
    const idTitulo = useId();
    const idTexto = useId();
    const [cuentas, setCuentas] = useState(null);
    const [error, setError] = useState('');
    const [activasOk, setActivasOk] = useState(() => new Set());
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const enviandoRef = useRef(false);
    const cerrar = useCallback(() => { if (!enviandoRef.current) onCerrar(); }, [onCerrar]);
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose: cerrar });

    useEffect(() => {
        const controller = new AbortController();
        pedirAdmin('/api/admin/cuentas/eliminar/revisar', { user_ids: ids }, { signal: controller.signal })
            .then((r) => setCuentas(Array.isArray(r?.cuentas) ? r.cuentas : []))
            .catch(() => { if (!controller.signal.aborted) setError(TEXTOS.errorRevisar); });
        return () => controller.abort();
    }, [ids]);

    // Se envían TODAS las elegidas (el servidor vuelve a mirar cada una); el número a escribir es el de las que pueden irse.
    const borrables = (cuentas || []).filter((c) => !c.bloqueo && (!c.activa || activasOk.has(c.user_id)));
    const n = borrables.length;
    const valido = n > 0 && texto.trim().toUpperCase() === 'ELIMINAR';

    const alternarActiva = (id) => setActivasOk((s) => {
        const x = new Set(s);
        if (x.has(id)) x.delete(id); else x.add(id);
        return x;
    });

    const enviar = async (e) => {
        e.preventDefault();
        if (!valido || enviandoRef.current) return;
        enviandoRef.current = true;
        setEnviando(true);
        setError('');
        try {
            const r = await pedirAdmin('/api/admin/cuentas/eliminar', {
                user_ids: borrables.map((c) => c.user_id),
                confirmacion: 'ELIMINAR',
                confirmar_activas: [...activasOk],
            });
            onTerminar(Array.isArray(r?.resultados) ? r.resultados : []);
        } catch (err) {
            enviandoRef.current = false;
            setEnviando(false);
            setError(TEXTOS.errores[err?.detalle] || TEXTOS.errorGenerico);
        }
    };

    return (
        <div className={base.velo} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
            <form
                ref={containerRef}
                className={`${base.dialogo} ${styles.dialogoEliminar}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                tabIndex={-1}
                onSubmit={enviar}
            >
                <h3 id={idTitulo} className={base.dialogoTitulo}>{TEXTOS.titulo(ids.length)}</h3>
                <p className={styles.avisoPeligro}>
                    <AlertTriangle size={16} strokeWidth={2.4} aria-hidden="true" />
                    {TEXTOS.explicacion}
                </p>
                {cuentas === null && !error && <p className={styles.explicacion} role="status">{TEXTOS.revisando}</p>}
                {cuentas && (
                    <ul className={styles.listaEliminar}>
                        {cuentas.map((c) => (
                            <li key={c.user_id} className={styles.filaEliminar} data-bloqueada={c.bloqueo ? 'true' : undefined} data-activa={c.activa ? 'true' : undefined}>
                                <div className={styles.filaEliminarTexto}>
                                    <strong>{c.email || c.user_id}</strong>
                                    <span>
                                        {c.ultima_actividad ? TEXTOS.ultima(fecha(c.ultima_actividad)) : TEXTOS.sinActividad}
                                        {' · '}
                                        {TEXTOS.numeros(c)}
                                    </span>
                                    {c.bloqueo && <span className={styles.bloqueoEliminar}>{TEXTOS.bloqueo[c.bloqueo] || c.bloqueo}</span>}
                                </div>
                                {!c.bloqueo && c.activa && (
                                    <label className={styles.confirmacion}>
                                        <input type="checkbox" checked={activasOk.has(c.user_id)} onChange={() => alternarActiva(c.user_id)} />
                                        <span><span className={styles.etiquetaActiva}>{TEXTOS.activa}</span> {TEXTOS.confirmarActiva}</span>
                                    </label>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {cuentas && n === 0 && <p className={styles.explicacion}>{TEXTOS.nada}</p>}
                {cuentas && n > 0 && (
                    <div className={base.campo}>
                        <label htmlFor={idTexto} className={base.etiqueta}>{TEXTOS.escribe}</label>
                        <input id={idTexto} className={base.input} value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" spellCheck={false} maxLength={20} />
                    </div>
                )}
                {error && <p className={base.error} role="alert">{error}</p>}
                <div className={base.pie}>
                    <button type="button" className={base.boton} onClick={cerrar} disabled={enviando}>{TEXTOS.cancelar}</button>
                    <button type="submit" className={`${base.primario} ${styles.botonPeligro}`} disabled={!valido} aria-disabled={enviando || undefined}>
                        {enviando ? TEXTOS.borrando : TEXTOS.boton(n)}
                    </button>
                </div>
            </form>
        </div>
    );
}
