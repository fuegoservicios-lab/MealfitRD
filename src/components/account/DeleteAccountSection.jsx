// [P1-ACCOUNT-DELETE-1 · 2026-06-22] Sección "Eliminar cuenta" REUTILIZABLE.
// Se usa en DOS lugares: AccountSettings (/configuracion, landing) Y Settings
// (/dashboard/settings, panel del dashboard). Self-contained: trae sus propios
// estilos (prefijo .mf-dz-) usando las CSS vars globales del tema, para verse
// idéntica en ambos contextos sin depender del CSS de la página padre.
//
// Diseño minimalista-premium: jerarquía tipográfica (eyebrow + título + cuerpo),
// espaciado generoso, UN solo acento de peligro. Sin cajas que lo carguen.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAssessment } from '../../context/AssessmentContext';
import { fetchWithAuth } from '../../config/api';
import Modal from '../common/Modal';

const DZ_STYLES = `
.mf-dz-card {
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, #ef4444 15%, var(--border));
    border-radius: 20px;
    padding: 1.9rem 1.9rem 1.75rem;
    box-shadow: var(--shadow-sm);
    margin-bottom: 1.25rem;
}
.mf-dz-eyebrow {
    display: inline-flex; align-items: center; gap: 0.5rem;
    margin-bottom: 0.95rem;
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    color: #f0656a;
}
.mf-dz-eyebrow-dot {
    width: 26px; height: 26px; flex-shrink: 0; display: grid; place-items: center;
    border-radius: 8px;
    background: color-mix(in srgb, #ef4444 13%, transparent);
    color: #f0656a;
}
.mf-dz-title {
    font-size: 1.4rem; font-weight: 800; letter-spacing: -0.025em; line-height: 1.15;
    color: var(--text-main); margin: 0 0 0.7rem; font-family: var(--font-heading, inherit);
}
.mf-dz-text {
    font-size: 0.94rem; line-height: 1.7; color: var(--text-muted);
    margin: 0 0 1.75rem; max-width: 56ch;
}
.mf-dz-text strong { color: var(--text-main); font-weight: 650; }
.mf-dz-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    padding: 0.85rem 1.6rem; border: none; border-radius: 13px; cursor: pointer;
    background: #dc2626; color: #fff; font-weight: 700; font-size: 0.92rem; font-family: inherit;
    transition: background 0.18s ease, transform 0.16s ease, box-shadow 0.16s ease;
}
.mf-dz-btn:hover:not(:disabled) {
    background: #ef4444; transform: translateY(-1px);
    box-shadow: 0 10px 26px -8px color-mix(in srgb, #ef4444 60%, transparent);
}
.mf-dz-btn:active:not(:disabled) { transform: translateY(0); }
.mf-dz-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.mf-dz-spin { animation: mf-dz-spin 0.8s linear infinite; }
@keyframes mf-dz-spin { to { transform: rotate(360deg); } }
@media (max-width: 560px) { .mf-dz-btn { width: 100%; } }

/* Modal */
.mf-dz-mtitle { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 0.7rem; color: var(--text-main); font-family: var(--font-heading, inherit); }
.mf-dz-mtext { color: var(--text-muted); font-size: 0.93rem; line-height: 1.6; margin: 0 0 1.4rem; }
.mf-dz-label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem; }
.mf-dz-input {
    width: 100%; box-sizing: border-box; padding: 0.8rem 0.95rem;
    border: 1.5px solid var(--border); border-radius: 12px;
    background: var(--bg-page); color: var(--text-main);
    font-size: 1rem; font-family: inherit; letter-spacing: 0.18em; text-align: center; font-weight: 700;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.mf-dz-input::placeholder { color: var(--text-light, var(--text-muted)); font-weight: 500; letter-spacing: 0.18em; }
.mf-dz-input:focus-visible { outline: none; border-color: #ef4444; box-shadow: 0 0 0 3px color-mix(in srgb, #ef4444 18%, transparent); }
.mf-dz-actions { display: flex; gap: 0.7rem; margin-top: 1.5rem; }
.mf-dz-actions .mf-dz-btn { flex: 1; }
.mf-dz-ghost { background: var(--bg-muted); color: var(--text-main); }
.mf-dz-ghost:hover:not(:disabled) { background: color-mix(in srgb, var(--text-main) 9%, var(--bg-muted)); transform: none; box-shadow: none; }
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
                <span className="mf-dz-eyebrow">
                    <span className="mf-dz-eyebrow-dot"><AlertTriangle size={15} strokeWidth={2.25} /></span>
                    Zona de peligro
                </span>
                <h2 className="mf-dz-title">Eliminar tu cuenta</h2>
                <p className="mf-dz-text">
                    Esta acción es <strong>permanente</strong>. Se borrarán tu plan, tu progreso,
                    tu nevera y todos tus datos, y se cancelará cualquier suscripción activa.
                    No se puede deshacer.
                </p>
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
                    Escribe ELIMINAR para confirmar
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
