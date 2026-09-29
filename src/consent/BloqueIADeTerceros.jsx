// [P1-PLAN-LOTE-844 · 2026-09-29] Configuración → Privacidad → «IA de terceros»: a quién van los datos, la versión y la
// fecha del permiso aceptado, y «Retirar mi permiso» con confirmación (POST /api/consents/withdraw). Retirarlo no
// obliga a borrar la cuenta (auditoría §A.1 «Retirada», y Privacidad §10 lo describe). Sin permiso, el mismo sitio
// ofrece activarlo.
//
// Retirar también pausa la generación del plan en el servidor (backend 843, vía el modo plan): la app pasa a modo
// contador igual que con el interruptor de Capacidades, y por la misma razón se recarga si había plan en memoria.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAssessment } from '../context/AssessmentContext';
import { formatDate, useT } from '../i18n';
import { confirmToast } from '../utils/confirmToast';
import { safeLocalStorageSet } from '../utils/safeLocalStorage';
import { pedirHojaConsentimientoIA, refrescarConsentimientoIA, retirarConsentimientoIA, useConsentimientoIA } from './consentimientoIA';

const FECHA = { day: 'numeric', month: 'long', year: 'numeric' };

const botonBase = {
    flexShrink: 0,
    minHeight: '40px',
    padding: '0.5rem 1rem',
    borderRadius: '0.65rem',
    fontWeight: 600,
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    cursor: 'pointer',
};

export default function BloqueIADeTerceros() {
    const t = useT();
    const permiso = useConsentimientoIA();
    const { planData, refreshProfileAndPlan, updateData } = useAssessment();
    const [retirando, setRetirando] = useState(false);

    // Lo que dice el perfil puede ser de antes de un cambio hecho en otro dispositivo: aquí se relee.
    useEffect(() => {
        void refrescarConsentimientoIA();
    }, []);

    const retirar = async () => {
        if (retirando) return;
        const ok = await confirmToast(t('¿Retirar tu permiso para la IA?'), {
            description: t('Dejaremos de enviar tus datos a los proveedores de IA. La generación de tu plan se pausa y el coach, el escáner y las demás funciones con IA dejan de funcionar hasta que vuelvas a activarla. Tus datos no se borran.'),
            confirmLabel: t('Retirar permiso'),
            cancelLabel: t('Cancelar'),
            danger: true,
        });
        if (!ok) return;
        setRetirando(true);
        try {
            const { planPausado } = await retirarConsentimientoIA();
            if (planPausado) {
                // El espejo del modo, como el interruptor de Capacidades: la nav no pinta un instante el modo viejo.
                safeLocalStorageSet('mealfit_plan_mode', 'tracking');
                try { if (typeof updateData === 'function') updateData('appMode', 'tracking'); } catch { /* el formulario lo recoge luego */ }
            }
            toast.success(t('Listo. Ya no enviaremos tus datos a la IA.'), {
                description: planPausado ? t('Pausamos la generación de tu plan; la app queda como contador.') : undefined,
            });
            if (planPausado) {
                if (planData) setTimeout(() => window.location.reload(), 900);
                else { try { if (typeof refreshProfileAndPlan === 'function') await refreshProfileAndPlan(); } catch { /* el siguiente foco */ } }
            }
        } catch {
            toast.error(t('No pudimos retirar tu permiso. Inténtalo de nuevo.'));
        } finally {
            setRetirando(false);
        }
    };

    let estado = t('Comprobando tu permiso…');
    let detalle = null;
    if (permiso.vigente === true) {
        estado = t('Permiso activo');
        detalle = permiso.aceptadoEn
            ? t('Aceptado el {fecha} · versión {version}', { fecha: formatDate(permiso.aceptadoEn, FECHA), version: permiso.version || '—' })
            : null;
    } else if (permiso.vigente === false && permiso.revocadoEn) {
        estado = t('Permiso retirado');
        detalle = t('Lo retiraste el {fecha}. Las funciones con IA no están disponibles hasta que la vuelvas a activar.', { fecha: formatDate(permiso.revocadoEn, FECHA) });
    } else if (permiso.vigente === false) {
        estado = t('Sin permiso');
        detalle = t('Sin él, el plan, el coach y el escáner no funcionan; el diario manual, el agua y la Nevera sí.');
    }

    return (
        <>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', margin: '1.75rem 0 0.75rem' }}>{t('IA de terceros')}</h3>
            <div
                className="ph-no-capture"
                data-testid="bloque-ia-de-terceros"
                style={{
                    padding: '0.9rem 1.1rem', marginBottom: '0.6rem',
                    border: '1px solid var(--border)', borderRadius: '0.875rem', background: 'var(--bg-card)',
                }}
            >
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('Para crear tu plan, responderte en el coach y analizar tus fotos, tus datos van a DeepSeek (China), a OpenAI y Google Gemini (EE. UU.) y a Cohere.')}
                </p>
                <div style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem 1rem', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 14rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.925rem', color: 'var(--text-main)' }}>{estado}</div>
                        {detalle && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.5 }}>{detalle}</div>
                        )}
                    </div>
                    {permiso.vigente === true && (
                        <button
                            type="button"
                            data-hover="fantasma"
                            onClick={retirar}
                            disabled={retirando}
                            style={{
                                ...botonBase,
                                border: '1px solid var(--danger-border)', background: 'transparent', color: 'var(--danger-text)',
                                opacity: retirando ? 0.7 : 1, cursor: retirando ? 'wait' : 'pointer',
                            }}
                        >
                            {retirando ? t('Retirando…') : t('Retirar mi permiso')}
                        </button>
                    )}
                    {permiso.vigente === false && (
                        <button
                            type="button"
                            data-hover="boton"
                            onClick={() => { void pedirHojaConsentimientoIA(); }}
                            style={{ ...botonBase, border: '1px solid transparent', background: 'var(--primary-fill)', color: '#fff' }}
                        >
                            {t('Activar la IA')}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
