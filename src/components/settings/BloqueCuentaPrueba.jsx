// [P1-PLAN-LOTE-835 · 2026-09-29] Configuración → Privacidad → «Cuenta de prueba» (spec 2026-09-29, §5).
//
// El bloque FIJO de la marca: la misma explicación del aviso y «Salir del modo de prueba», con confirmación (salir corta
// el acceso del equipo a su actividad y solo el equipo puede volver a incluirla). Tras salir dice que el equipo ya no ve
// la actividad y el botón desaparece; ese mensaje se conserva aunque el perfil, al refrescarse, ya no traiga la marca
// (y, si el equipo la vuelve a poner —otra `desde`—, el bloque vuelve a ofrecer la salida).
// Solo existe para quien tiene la marca: una cuenta normal no ve nada aquí.
//
// El perfil viene del contexto que ya lee Configuración (`userProfile.cuenta_de_prueba`): no se pide nada más ni se
// añade estado a AssessmentContext.jsx. `salir` funciona SIEMPRE en el servidor, con su interruptor apagado también.
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAssessment } from '../../context/AssessmentContext';
import { useT } from '../../i18n';
import { confirmToast } from '../../utils/confirmToast';
import { refrescarPerfil, salirDelModoDePrueba, textosCuentaDePrueba } from '../../utils/cuentaDePrueba';

export default function BloqueCuentaPrueba() {
    const t = useT();
    const tx = useMemo(() => textosCuentaDePrueba(t), [t]);
    const { session, userProfile, refreshProfileAndPlan } = useAssessment() || {};
    const [saliendo, setSaliendo] = useState(false);
    const [salioDe, setSalioDe] = useState(null);   // la marca (por su fecha) de la que salió en esta carga
    const ocupado = useRef(false);
    const mensaje = useRef(null);

    // El perfil en memoria puede ser el de otra cuenta un instante tras cambiar de sesión: no se le enseña a esta.
    const uid = (session && session.user && session.user.id) || null;
    const esDeEstaCuenta = !userProfile || !userProfile.id || !uid || userProfile.id === uid;
    const marcaDelPerfil = esDeEstaCuenta && userProfile ? userProfile.cuenta_de_prueba : null;
    const claveDeMarca = marcaDelPerfil ? String(marcaDelPerfil.desde || 'sin-fecha') : null;
    // Salió de ESTA marca (o el perfil ya no trae ninguna): el mensaje. Una marca NUEVA vuelve a ofrecer la salida.
    const yaSalio = salioDe !== null && (claveDeMarca === null || claveDeMarca === salioDe);

    // El botón que tenía el foco desaparece al salir: el foco pasa al mensaje (no se pierde en el <body>), y un lector de
    // pantalla lo lee. Sin desplazar la página.
    useEffect(() => {
        if (yaSalio && mensaje.current) mensaje.current.focus({ preventScroll: true });
    }, [yaSalio]);

    const salir = async () => {
        if (ocupado.current) return;
        ocupado.current = true;
        const deEstaMarca = claveDeMarca || 'sin-marca';   // la marca de la que se sale, aunque el perfil cambie en el camino
        try {
            const confirmado = await confirmToast(tx.confirmar, {
                description: tx.confirmarDetalle,
                confirmLabel: tx.salir,
                cancelLabel: tx.cancelar,
            });
            if (!confirmado) return;
            setSaliendo(true);
            const { ok } = await salirDelModoDePrueba();
            if (!ok) {
                toast.error(tx.errorSalir);
                return;
            }
            setSalioDe(deEstaMarca);
            toast.success(tx.salio);
            refrescarPerfil(refreshProfileAndPlan);
        } finally {
            ocupado.current = false;
            setSaliendo(false);
        }
    };

    if (!marcaDelPerfil && !yaSalio) return null;

    return (
        <>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', margin: '1.75rem 0 0.75rem' }}>{tx.bloque}</h3>
            <div
                className="ph-no-capture"
                data-testid="bloque-cuenta-de-prueba"
                style={{
                    padding: '0.9rem 1.1rem', marginBottom: '0.6rem',
                    border: '1px solid var(--border)', borderRadius: '0.875rem', background: 'var(--bg-card)',
                }}
            >
                {yaSalio ? (
                    <p ref={mensaje} tabIndex={-1} role="status" style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.5 }}>
                        {tx.salio}
                    </p>
                ) : (
                    <>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{tx.explicacion}</p>
                        <div style={{ marginTop: '0.8rem' }}>
                            {/* `aria-disabled` y NO `disabled` mientras viaja la petición: el botón conserva el foco (con `disabled` lo
                                suelta al <body> y, si falla, el teclado empieza otra vez desde arriba). `ocupado` ignora el 2.º clic. */}
                            <button
                                type="button"
                                data-hover="fantasma"
                                onClick={salir}
                                aria-disabled={saliendo ? 'true' : undefined}
                                style={{
                                    minHeight: '40px', padding: '0.5rem 1rem', borderRadius: '0.65rem',
                                    fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit',
                                    border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)',
                                    opacity: saliendo ? 0.7 : 1, cursor: saliendo ? 'wait' : 'pointer',
                                }}
                            >
                                {saliendo ? tx.saliendo : tx.salir}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
