// [P1-ACCOUNT-DELETE-1 · 2026-06-22] Sección "Eliminar cuenta" REUTILIZABLE.
// Se usa en DOS lugares: AccountSettings (/configuracion, landing) Y Settings
// (/dashboard/settings, panel del dashboard). Self-contained: trae sus propios
// estilos (prefijo .mf-dz-) usando las CSS vars globales del tema, para verse
// idéntica en ambos contextos sin depender del CSS de la página padre.
//
// Diseño minimalista-premium: jerarquía tipográfica (eyebrow + título + cuerpo),
// espaciado generoso, UN solo acento de peligro. Sin cajas que lo carguen.
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAssessment } from '../../context/AssessmentContext';
import { fetchWithAuth } from '../../config/api';
import Modal from '../common/Modal';
import { useT } from '../../i18n';
import { mensajeDeError } from '../../utils/errorCopy';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../../utils/safeLocalStorage';

/* [P1-PLAN-LOTE-718 · 2026-09-28] Lo que SÍ se queda en el dispositivo cuando se borra una cuenta: son
   del TELÉFONO o del NAVEGADOR, no de la persona. Todo lo demás con prefijo `mealfit_`/`mf_` se va.
   · el idioma y la apariencia elegidos (la próxima persona en este dispositivo los heredaría igual al cerrar sesión);
   · `mealfit_analytics_opt_out`: el «no me midas» NO puede caer con la cuenta — borrarlo encendería la analítica;
   · `mealfit_fcm_token`: el token de FCM identifica al TELÉFONO; el servidor ya no lo tiene para esta cuenta;
   · las marcas del OTA (qué versión se vio/bloqueó) y las calibraciones del teclado y de la barra de pestañas;
   · `mf_cuentas_dispositivo` se PODA aparte: sale solo la cuenta borrada, las demás de este teléfono siguen. */
const CONSERVAR_AL_BORRAR = new Set([
    'mealfit_locale', 'mealfit_theme', 'mealfit_analytics_opt_out', 'mealfit_fcm_token', 'mf_cuentas_dispositivo',
]);
const PREFIJOS_CONSERVAR_AL_BORRAR = ['mf_ota_', 'mf_kb_', 'mf_tabbar_'];
// La lista de `utils/cuentasDelDispositivo.js` (su clave no se exporta; el formato sí: `[{ id, correo, visto }]`).
const CLAVE_CUENTAS_DEL_DISPOSITIVO = 'mf_cuentas_dispositivo';

/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] La política de privacidad promete que lo local no sobrevive a la sesión, y al
 * borrar la cuenta sobrevivía casi todo: `resetApp` es el cierre de sesión y conserva a propósito `mealfit_form`
 * (datos del formulario: nombre, peso, objetivos…) para que un invitado los reutilice, y no toca las cachés con
 * prefijo (`mealfit_micros_*`, `mealfit_tracking_consumed_*`, `mealfit_water_state_*`, `mealfit_pantry_*`,
 * `mealfit_notifications`, `mealfit_chat_*`, `mealfit_help_chat_msgs_v1`, `mealfit_wizard_*`, `mealfit_plan_mode`,
 * `mealfit_nevera_*`, `mealfit_last_form_owner`, `mealfit_locale_owner`, `mf_brand_*`…) ni los borradores del chat
 * (IndexedDB `mealfit-agent-drafts`). Se barre por prefijo y no con una lista a mano: la lista a mano se queda atrás
 * en cuanto alguien añade una clave nueva, y el fallo es silencioso.
 */
function borrarRastroLocal(uid) {
    const conservar = (k) => CONSERVAR_AL_BORRAR.has(k) || PREFIJOS_CONSERVAR_AL_BORRAR.some((p) => k.startsWith(p));
    const barrer = (almacen) => {
        try {
            if (!almacen) return;
            const claves = [];
            for (let i = 0; i < almacen.length; i += 1) {
                const k = almacen.key(i);
                if (k && (k.startsWith('mealfit_') || k.startsWith('mf_')) && !conservar(k)) claves.push(k);
            }
            claves.forEach((k) => { try { almacen.removeItem(k); } catch { /* sigue con las demás */ } });
        } catch { /* almacenamiento bloqueado (modo privado de iOS): no hay nada que barrer */ }
    };
    // `window.localStorage`/`sessionStorage` y no el envoltorio: hay que ENUMERAR claves, que el envoltorio no
    // hace. Cada acceso va en su try/catch (modo privado de iOS), que es lo que el envoltorio garantiza.
    try { barrer(window.localStorage); } catch { /* sin localStorage */ }
    try { barrer(window.sessionStorage); } catch { /* sin sessionStorage */ }
    // La cuenta borrada sale de «cuentas de este dispositivo» (su correo enmascarado quedaba ahí para siempre).
    try {
        const lista = JSON.parse(safeLocalStorageGet(CLAVE_CUENTAS_DEL_DISPOSITIVO, '[]'));
        if (uid && Array.isArray(lista) && lista.some((c) => c && c.id === uid)) {
            const quedan = lista.filter((c) => c && c.id !== uid);
            if (quedan.length) safeLocalStorageSet(CLAVE_CUENTAS_DEL_DISPOSITIVO, JSON.stringify(quedan));
            else safeLocalStorageRemove(CLAVE_CUENTAS_DEL_DISPOSITIVO);
        }
    } catch { /* lista ilegible: se queda como estaba */ }
    // Borradores del chat (texto y adjuntos a medio escribir), en IndexedDB.
    import('../../utils/chatDraftStore').then((m) => m.clearAllChatDrafts()).catch(() => {});
}

const DZ_STYLES = `
.mf-dz-card {
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, #ef4444 15%, var(--border));
    border-radius: 20px;
    padding: 1.9rem 1.9rem 1.75rem;
    box-shadow: var(--shadow-sm);
    margin-bottom: 1.25rem;
}
/* [P1-PLAN-LOTE-718 · 2026-09-28] 0.7rem = 11,2 px, por debajo del mínimo de 12 px del sistema. */
.mf-dz-eyebrow {
    display: inline-flex; align-items: center; gap: 0.5rem;
    margin-bottom: 0.95rem;
    font-size: 0.75rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--danger-text);
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
    background: var(--danger-fill); color: #fff; font-weight: 700; font-size: 0.92rem; font-family: inherit;
    transition: box-shadow 0.16s ease, filter 0.16s ease;
}
/* [P2-HOVER-NO-MOTION · 2026-09-03] misma receta que .ui-btn-danger: sombra + brillo, sin lift */
.mf-dz-btn:hover:not(:disabled) {
    box-shadow: var(--cta-shadow-danger-hover); filter: brightness(1.06);
}
.mf-dz-btn:active:not(:disabled) { box-shadow: var(--cta-shadow-danger-active); filter: none; }
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
/* [P1-PLAN-LOTE-718 · 2026-09-28] El placeholder es la palabra que HAY que escribir: es texto, no adorno.
   --text-light (≈3:1) es solo para adornos; --text-muted pasa AA. */
.mf-dz-input::placeholder { color: var(--text-muted); font-weight: 500; letter-spacing: 0.18em; }
.mf-dz-input:focus-visible { outline: none; border-color: #ef4444; box-shadow: 0 0 0 3px color-mix(in srgb, #ef4444 18%, transparent); }
.mf-dz-actions { display: flex; gap: 0.7rem; margin-top: 1.5rem; }
.mf-dz-actions .mf-dz-btn { flex: 1; }
.mf-dz-ghost { background: var(--bg-muted); color: var(--text-main); }
.mf-dz-ghost:hover:not(:disabled) { background: color-mix(in srgb, var(--text-main) 9%, var(--bg-muted)); transform: none; box-shadow: none; filter: none; }
`;

export default function DeleteAccountSection() {
    const t = useT();
    const navigate = useNavigate();
    const { resetApp, resetForNewAssessment, session } = useAssessment();
    const [showModal, setShowModal] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const confirmInputRef = useRef(null);

    // [P1-PLAN-LOTE-167 · 2026-09-22] La palabra a escribir va en el idioma de la pantalla («DELETE», «SUPPRIMER»…): se
    // pedía «ELIMINAR» en los cinco. Se compara contra ESA misma variable (la que pinta la etiqueta y el placeholder),
    // así que una traducción no puede dejar el botón muerto; «ELIMINAR» sigue valiendo, y al servidor le llega siempre
    // `confirm: 'ELIMINAR'` (es el contrato de la API, no copy).
    const palabra = t('ELIMINAR');
    const escrito = confirmText.trim().toUpperCase();
    const ready = escrito === palabra.toUpperCase() || escrito === 'ELIMINAR';

    const handleDelete = async () => {
        if (!ready || isDeleting) return;
        setIsDeleting(true);
        // [P1-PLAN-LOTE-718 · 2026-09-28] (a) Los avisos de ESTE dispositivo se apagan ANTES de borrar la cuenta,
        // mientras la sesión todavía vale. Después, `resetApp` → `apagarAvisosAlCerrarSesion` mandaba sus DELETE
        // (suscripción Web Push, token de FCM) con la cuenta ya borrada: 401, y el 401 dispara el aviso global
        // `mealfit:session-expired` → «Tu sesión expiró» encima de «Tu cuenta fue eliminada». `config/api.ts` no tiene
        // forma de silenciar esa señal, así que se ordena: limpiado aquí, lo de después ya no tiene nada que borrar
        // (`olvidarTokenAlCerrarSesion` solo borra lo registrado; la suscripción ya no existe).
        // Si el borrado FALLA, los avisos se vuelven a encender (abajo): una cuenta que sigue viva no pierde nada.
        let avisosEncendidos = false;
        try {
            const avisos = await import('../../utils/avisosDeComida');
            avisosEncendidos = avisos.interruptorAlNacer();
            await avisos.apagarAvisosAlCerrarSesion();
        } catch { /* best-effort: el borrado sigue */ }
        const restaurarAvisos = () => {
            if (!avisosEncendidos) return;
            avisosEncendidos = false;   // una sola vez, venga del `!res.ok` o del `catch`
            import('../../utils/avisosDeComida').then((m) => m.activarAvisos()).catch(() => { /* se reactivan desde Configuración */ });
        };
        // (b) Lo local de la persona, fuera. Primero el formulario EN MEMORIA (`resetForNewAssessment`): si no, el
        // efecto que persiste `formData` volvía a escribir `mealfit_form` con sus datos en cuanto la sesión pasara a
        // null. Después el cierre de sesión de siempre, y al final el barrido de lo que `resetApp` deja a propósito.
        const cerrarYBorrarLoLocal = async (uid) => {
            try { resetForNewAssessment?.(); } catch { /* sigue el cierre */ }
            await resetApp();
            borrarRastroLocal(uid);
        };
        try {
            const res = await fetchWithAuth('/api/account/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: 'ELIMINAR' }),
            });
            if (!res.ok) {
                restaurarAvisos();
                let detail = t('No se pudo eliminar la cuenta. Inténtalo de nuevo.');
                // [P1-PLAN-LOTE-718 · 2026-09-28] (c) El motivo que SÍ se sabe, por status. El backend cancela PayPal
                // ANTES de borrar y, si PayPal no responde o lo rechaza (502) o no está configurado (503), ABORTA el
                // borrado a propósito: una cuenta borrada con la suscripción viva seguiría cobrando. «Inténtalo de
                // nuevo» a secas no decía que la cuenta sigue intacta ni por qué.
                if (res.status === 502 || res.status === 503) {
                    detail = t('No pudimos cancelar tu suscripción con PayPal, así que no borramos tu cuenta: así no te seguirá cobrando. Inténtalo en unos minutos; si continúa, escríbenos a {correo}.', { correo: 'bioboros.support@gmail.com' });
                } else if (res.status === 429) {
                    detail = t('Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.');
                } else {
                    // [P1-PLAN-LOTE-165] el `detail` del servidor va por código (sin código, el aviso propio): en crudo
                    // salía en español en los cinco idiomas.
                    try { const j = await res.json(); detail = mensajeDeError(j, detail, t); } catch { /* sin body JSON */ }
                }
                throw Object.assign(new Error(detail), { paraMostrar: true });
            }
            // Borrado OK → logout total (limpia localStorage/caches + signOut +
            // session=null sincrónico) y al login. El componente se desmonta al
            // navegar, por eso NO reseteamos isDeleting en el happy-path.
            //
            // [P1-PLAN-LOTE-162 · 2026-09-22] Un borrado A MEDIAS responde 200 con `success: false` (el motor sigue
            // tabla a tabla y junta los errores), y aquí solo se miraba `res.ok`: salía «Tu cuenta fue eliminada»
            // aunque quedaran datos. Se dice lo que pasó y cómo terminarlo; la sesión se cierra igual.
            let _resultado = null;
            try { _resultado = await res.json(); } catch { /* sin cuerpo JSON: se trata como hecho */ }
            // [P1-PLAN-LOTE-721 · 2026-09-28] Las fotos de sus platos viven SOLO en este dispositivo: con la cuenta se van.
            // Fuego y olvido: el borrado del servidor ya ocurrió y el logout no puede esperar a IndexedDB.
            const _uid = session?.user?.id;
            if (_uid) import('../../utils/fotosDeComidas').then((m) => m.borrarFotosDelUsuario(_uid)).catch(() => {});
            if (_resultado && _resultado.success === false) {
                console.error('Borrado de cuenta incompleto:', _resultado.errors);
                toast.warning(
                    t('Borramos tu cuenta, pero algunos datos no se pudieron eliminar. Escríbenos a {correo} y lo terminamos.', { correo: 'bioboros.support@gmail.com' }),
                    { duration: 6000 },
                );
                await cerrarYBorrarLoLocal(_uid);
                navigate('/login', { replace: true });
                return;
            }
            toast.success(t('Tu cuenta fue eliminada.'));
            await cerrarYBorrarLoLocal(_uid);
            navigate('/login', { replace: true });
        } catch (err) {
            console.error('Error eliminando cuenta:', err);
            // Sin respuesta del servidor (red caída) no se sabe si borró; se vuelven a encender los avisos igual: si la
            // cuenta sigue viva es lo correcto, y si no, el 401 de esa suscripción cierra la sesión, que también lo es.
            restaurarAvisos();
            toast.error(err?.paraMostrar ? err.message : t('No se pudo eliminar la cuenta.'));
            setIsDeleting(false);
        }
    };

    return (
        <>
            <style>{DZ_STYLES}</style>
            <section className="mf-dz-card">
                <span className="mf-dz-eyebrow">
                    <span className="mf-dz-eyebrow-dot"><AlertTriangle size={15} strokeWidth={2.25} /></span>
                    {t('Zona de peligro')}
                </span>
                <h2 className="mf-dz-title">{t('Eliminar tu cuenta')}</h2>
                <p className="mf-dz-text">
                    {t('Esta acción es')} <strong>{t('permanente')}</strong>{t('. Se borrarán tu plan, tu progreso, tu nevera y todos tus datos, y se cancelará cualquier suscripción activa. No se puede deshacer.')}
                </p>
                <button className="mf-dz-btn" onClick={() => { setConfirmText(''); setShowModal(true); }}>
                    <Trash2 size={16} /> {t('Eliminar mi cuenta')}
                </button>
            </section>

            <Modal
                isOpen={showModal}
                onClose={() => { if (!isDeleting) setShowModal(false); }}
                titleId="mf-dz-modal-title"
                maxWidth="440px"
                disableClose={isDeleting}
                isBottomSheetOnMobile
                adjustToKeyboard
                initialFocusRef={confirmInputRef}
            >
                <h3 id="mf-dz-modal-title" className="mf-dz-mtitle">{t('¿Eliminar tu cuenta?')}</h3>
                <p className="mf-dz-mtext">
                    {t('Esta acción es')} <strong>{t('permanente')}</strong>{t('. Se borrarán tu plan, tu progreso, tu nevera y todos tus datos, y se cancelará cualquier suscripción activa. No se puede deshacer.')}
                </p>
                <label className="mf-dz-label" htmlFor="mf-dz-confirm">
                    {/* La palabra va interpolado, no dentro de la frase: es la variable
                        EXACTA que compara `ready` (y el placeholder del campo). Si viajara
                        dentro del texto traducible, una traducción de la frase la cambiaría
                        y el botón de confirmar no se activaría nunca. [P1-PLAN-LOTE-167]
                        Ahora `palabra` es ella misma traducida, pero es UNA variable para
                        las tres cosas: pinta, placeholder y comparación no pueden divergir. */}
                    {t('Escribe {palabra} para confirmar', { palabra })}
                </label>
                {/* [P1-PLAN-LOTE-718 · 2026-09-28] (d) Sin `autoCorrect`/`spellCheck` apagados, el teclado del
                    móvil «corregía» la palabra (ELIMINAR → Eliminar, SUPPRIMER → Supprimer + acento) y el botón no
                    se activaba sin que se viera por qué. */}
                <input
                    ref={confirmInputRef}
                    id="mf-dz-confirm"
                    className="mf-dz-input"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={palabra}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={isDeleting}
                    onKeyDown={(e) => { if (e.key === 'Enter' && ready) handleDelete(); }}
                />
                <div className="mf-dz-actions">
                    <button className="mf-dz-btn mf-dz-ghost" onClick={() => setShowModal(false)} disabled={isDeleting}>
                        {t('Cancelar')}
                    </button>
                    <button className="mf-dz-btn" onClick={handleDelete} disabled={!ready || isDeleting}>
                        {isDeleting && <Loader2 size={16} className="mf-dz-spin" />}
                        {isDeleting ? t('Eliminando…') : t('Eliminar definitivamente')}
                    </button>
                </div>
            </Modal>
        </>
    );
}
