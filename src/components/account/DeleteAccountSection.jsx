// [P1-ACCOUNT-DELETE-1 · 2026-06-22] Sección "Eliminar cuenta" REUTILIZABLE.
// Se usa en DOS lugares: AccountSettings (/configuracion, landing) Y Settings
// (/dashboard/settings, panel del dashboard). Self-contained: trae sus propios
// estilos (prefijo .mf-dz-) usando las CSS vars globales del tema, para verse
// idéntica en ambos contextos sin depender del CSS de la página padre.
//
// UN SOLO ícono de peligro (en el header de la tarjeta) — la caja de aviso va
// sin ícono (pedido del owner: "1 solo svg de peligro").
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAssessment } from '../../context/AssessmentContext';
import { fetchWithAuth } from '../../config/api';
import Modal from '../common/Modal';

const DZ_STYLES = `
.mf-dz-card { background: var(--bg-card); border: 1px solid color-mix(in srgb, #ef4444 40%, var(--border)); border-radius: var(--radius-xl, 1rem); padding: 1.4rem; box-shadow: var(--shadow-sm); margin-bottom: 1.25rem; }
.mf-dz-head { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 1rem; }
.mf-dz-icon { width: 40px; height: 40px; flex-shrink: 0; display: grid; place-items: center; border-radius: var(--radius-md, 0.6rem); background: color-mix(in srgb, #ef4444 14%, transparent); color: #ef4444; }
.mf-dz-title { font-weight: 800; font-size: 1.1rem; margin: 0; color: var(--text-main); font-family: var(--font-heading, inherit); }
.mf-dz-sub { color: var(--text-muted); font-size: 0.82rem; margin: 0.1rem 0 0; }
.mf-dz-warn { background: color-mix(in srgb, #ef4444 10%, transparent); border: 1px solid color-mix(in srgb, #ef4444 30%, transparent); border-radius: var(--radius-md, 0.6rem); padding: 0.85rem; color: var(--text-main); font-size: 0.85rem; line-height: 1.45; margin-bottom: 1rem; }
.mf-dz-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; width: 100%; padding: 0.8rem 1.1rem; border: none; border-radius: var(--radius-md, 0.6rem); cursor: pointer; background: #ef4444; color: #fff; font-weight: 700; font-size: 0.95rem; font-family: inherit; transition: filter 0.15s ease, transform 0.05s ease; }
.mf-dz-btn:hover:not(:disabled) { filter: brightness(1.07); }
.mf-dz-btn:active:not(:disabled) { transform: translateY(1px); }
.mf-dz-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.mf-dz-spin { animation: mf-dz-spin 0.8s linear infinite; }
@keyframes mf-dz-spin { to { transform: rotate(360deg); } }
.mf-dz-mtitle { font-weight: 800; font-size: 1.25rem; margin: 0 0 0.6rem; color: var(--text-main); font-family: var(--font-heading, inherit); }
.mf-dz-mtext { color: var(--text-muted); font-size: 0.92rem; line-height: 1.5; margin: 0 0 1rem; }
.mf-dz-label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.4rem; }
.mf-dz-input { width: 100%; box-sizing: border-box; padding: 0.7rem 0.85rem; border: 1.5px solid var(--border); border-radius: var(--radius-md, 0.6rem); background: var(--bg-page); color: var(--text-main); font-size: 0.95rem; font-family: inherit; }
.mf-dz-input:focus-visible { outline: none; border-color: #ef4444; box-shadow: 0 0 0 3px color-mix(in srgb, #ef4444 22%, transparent); }
.mf-dz-actions { display: flex; gap: 0.6rem; margin-top: 1.25rem; }
.mf-dz-actions .mf-dz-btn { flex: 1; }
.mf-dz-ghost { background: var(--bg-muted); color: var(--text-main); }
.mf-dz-ghost:hover:not(:disabled) { filter: brightness(0.97); }
`;

export default function DeleteAccountSection() {
    const navigate = useNavigate();
    const { resetApp } = useAssessment();
    const [showModal, setShowModal] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const ready = confirmText.trim().toUpperCase() === 'ELIMINAR';

    const handleDelete = async () => {
        if (!ready || isDeleting) return;
        setIsDeleting(true);
        try {
            const res = await fetchWithAuth('/api/account/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: 'ELIMINAR' }),
            });
            if (!res.ok) {
                let detail = 'No se pudo eliminar la cuenta. Inténtalo de nuevo.';
                try { const j = await res.json(); if (j?.detail) detail = j.detail; } catch { /* sin body JSON */ }
                throw new Error(detail);
            }
            // Borrado OK → logout total (limpia localStorage/caches + signOut +
            // session=null sincrónico) y al login. El componente se desmonta al
            // navegar, por eso NO reseteamos isDeleting en el happy-path.
            toast.success('Tu cuenta fue eliminada.');
            await resetApp();
            navigate('/login', { replace: true });
        } catch (err) {
            console.error('Error eliminando cuenta:', err);
            toast.error(err?.message || 'No se pudo eliminar la cuenta.');
            setIsDeleting(false);
        }
    };

    return (
        <>
            <style>{DZ_STYLES}</style>
            <section className="mf-dz-card">
                <div className="mf-dz-head">
                    <div className="mf-dz-icon"><AlertTriangle size={20} /></div>
                    <div>
                        <h2 className="mf-dz-title">Zona de peligro</h2>
                        <p className="mf-dz-sub">Eliminar tu cuenta es permanente.</p>
                    </div>
                </div>
                <div className="mf-dz-warn">
                    Se borrarán <strong>tu plan, tu progreso, tu nevera y todos tus datos</strong>.
                    Si tienes una suscripción activa, la cancelaremos. Esta acción <strong>no se puede deshacer</strong>.
                </div>
                <button className="mf-dz-btn" onClick={() => { setConfirmText(''); setShowModal(true); }}>
                    <Trash2 size={16} /> Eliminar mi cuenta
                </button>
            </section>

            <Modal
                isOpen={showModal}
                onClose={() => { if (!isDeleting) setShowModal(false); }}
                titleId="mf-dz-modal-title"
                maxWidth="440px"
                disableClose={isDeleting}
                isBottomSheetOnMobile
            >
                <h3 id="mf-dz-modal-title" className="mf-dz-mtitle">¿Eliminar tu cuenta?</h3>
                <p className="mf-dz-mtext">
                    Esta acción es <strong>permanente</strong>. Se borrarán tu plan, tu progreso,
                    tu nevera y todos tus datos, y se cancelará cualquier suscripción activa.
                    No se puede deshacer.
                </p>
                <label className="mf-dz-label" htmlFor="mf-dz-confirm">
                    Escribe <strong>ELIMINAR</strong> para confirmar
                </label>
                <input
                    id="mf-dz-confirm"
                    className="mf-dz-input"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="ELIMINAR"
                    autoComplete="off"
                    autoCapitalize="characters"
                    disabled={isDeleting}
                    onKeyDown={(e) => { if (e.key === 'Enter' && ready) handleDelete(); }}
                />
                <div className="mf-dz-actions">
                    <button className="mf-dz-btn mf-dz-ghost" onClick={() => setShowModal(false)} disabled={isDeleting}>
                        Cancelar
                    </button>
                    <button className="mf-dz-btn" onClick={handleDelete} disabled={!ready || isDeleting}>
                        {isDeleting && <Loader2 size={16} className="mf-dz-spin" />}
                        {isDeleting ? 'Eliminando…' : 'Eliminar definitivamente'}
                    </button>
                </div>
            </Modal>
        </>
    );
}
