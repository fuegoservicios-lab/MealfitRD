// [P1-PLAN-MODE · 2026-08-11] El cierre del modo seguimiento: commit + payoff.
//
// Este paso hace lo que en el modo plan hace la generación, sin generar nada:
//   1. Persiste el perfil (PATCH /api/profile, merge jsonb) — hasta aquí el formulario
//      solo vivía en localStorage.
//   2. PULSA el interruptor (PUT /api/profile/plan-mode {tracking}) — el paso no ES el
//      interruptor: los crons no leen formData, y los crons son donde se gasta.
//   3. Espeja el modo en localStorage para el arranque en frío del dashboard («no sé»
//      no puede leerse como «plan», ver el wrapper de Dashboard.jsx).
//   4. Al dashboard, donde el contador ya tiene metas (/api/nutrition/targets).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gauge, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../../config/api';
import { guardarSuplementosEnAlacena } from '../../../utils/normalizarSuplementos';
import { useAssessment } from '../../../context/AssessmentContext';
import { TRACKING_REQUIRED_FIELDS } from '../../../config/formValidation';
import { useT } from '../../../i18n';
import { safeLocalStorageSet } from '../../../utils/safeLocalStorage';
import { confirmToast } from '../../../utils/confirmToast';

export const QTrackingFinish = () => {
    const navigate = useNavigate();
    const { formData, refreshProfileAndPlan, loadingSensitive, planData } = useAssessment();
    const t = useT();
    const [saving, setSaving] = useState(false);

    const terminar = async () => {
        if (saving) return;
        // [P1-TRACKING-FINISH-SENSITIVE-GUARD · 2026-08-12] Mismo guard que el
        // submit del plan y el salto (P1-14): alergias y condiciones médicas se
        // descifran ASÍNCRONO. Pulsar dentro de esa ventana PATCHeaba
        // medicalConditions=[] sobre el health_profile real (merge jsonb
        // key-level = destructivo) — y de paso puenteaba el gate de embarazo
        // de las metas (déficit calculado con condiciones «vacías»).
        if (loadingSensitive) {
            toast.info(t('Cargando tus datos…'), {
                description: t('Esperando a que se sincronice tu perfil. Inténtalo en unos segundos.'),
                duration: 3000,
            });
            return;
        }
        // [P1-PLAN-LOTE-137 · 2026-09-20] Esta puerta también PAUSA: quien llega aquí con un plan vivo («Cambiar mis
        // preferencias» ⇒ paso 0 ⇒ «Solo contar») cancelaba la cola de su plan sin que nadie se lo dijera — el paso
        // promete «sin plan generado», y la confirmación «¿Pausar…?» solo existía en Configuración. Mismo diálogo,
        // mismo copy.
        const _conPlanVivo = Array.isArray(planData?.days) && planData.days.length > 0
            && planData?.generation_status !== 'paused_by_user';
        if (_conPlanVivo) {
            const ok = await confirmToast(
                t('¿Pausar la generación de planes?'),
                {
                    description: t('La app pasa a modo contador (macros y diario). Tu plan no se pierde: queda guardado en tu Historial y puedes reanudarlo cuando quieras — retoma exactamente donde quedó.'),
                    confirmLabel: t('Pausar planes'),
                    cancelLabel: t('Volver'),
                },
            );
            if (!ok) return;
        }
        setSaving(true);
        try {
            // Solo los campos del contrato de seguimiento + los acompañantes que el
            // usuario haya llenado. Los 12 pasos saltados NO se rellenan con nada:
            // inventar un cookingTime hoy es un plan mal calibrado en tres meses
            // (las cicatrices P0-FORM-1/-4/-5 son exactamente esa clase).
            const hp = {};
            for (const campo of TRACKING_REQUIRED_FIELDS) {
                const v = formData[campo];
                if (v === undefined || v === null) continue;
                // [P1-TRACKING-FINISH-SENSITIVE-GUARD] Un array VACÍO no se
                // persiste: el merge jsonb es key-level y allergies/
                // medicalConditions=[] MACHACARÍA lo real del perfil. El
                // contrato de la rama exige no-vacío para llegar aquí; un []
                // solo puede ser hidratación incompleta — omitir la clave
                // conserva lo que el servidor ya sabe.
                if (Array.isArray(v) && v.length === 0) continue;
                hp[campo] = v;
            }
            // [P1-TRACKING-FINISH-KEYS · 2026-08-12] Las claves REALES de formData.
            // La lista original traía tres claves muertas (otherAllergy/otherCondition/
            // goalWeight — cero escritores en TODO el repo): una alergia escrita a mano
            // en «Otra…» se PERDÍA en silencio y el perfil quedaba diciendo «sin
            // alergias» — señal de safety descartada tras aceptarla como respuesta
            // válida. Los nombres canónicos son los que escriben los componentes:
            // QAllergies→otherAllergies, QMedical→otherConditions/medications/
            // otherMedications, QGoalTarget→targetWeight, QMeasurements→bodyFat/waistCm.
            for (const extra of [
                'otherAllergies', 'otherConditions', 'medications', 'otherMedications',
                'targetWeight', 'goalPace', 'bodyFat', 'waistCm',
                // [P1-COUNTRY-SYSTEM-F0] la rama corta es ALLOWLIST: sin esta
                // entrada el país se cae al suelo en silencio en modo contador.
                'country',
            ]) {
                // (el huso se añade abajo, fuera de este bucle: no vive en formData)
                const v = formData[extra];
                if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) {
                    hp[extra] = v;
                }
            }

            // [P1-TRACKING-TZ-CAPTURE · 2026-08-21] El huso del dispositivo. No vive en
            // `formData` (nadie lo contesta: es un dato del navegador), así que no puede ir en el
            // bucle de arriba — pero sufre EXACTAMENTE el mecanismo que el comentario de
            // `country` describe. Los únicos dos escritores de `tzOffset` en el perfil son
            // /analyze y /shift-plan, y un usuario de modo contador no pasa por ninguno: su
            // perfil se quedaba sin huso y `user_tz_offset_min` degradaba a 240 (RD) para
            // siempre, dejando inerte todo F1-T5 justo para quien SÓLO usa el diario y el coach.
            // En México eso significa que la cena de las 22:30 cuenta al día siguiente.
            //
            // Se calcula AQUÍ, en el submit, y nunca en una `const` de módulo: ese patrón se
            // evalúa al importar y en la máquina de desarrollo el valor congelado coincide con el
            // correcto, así que el fallo sólo aparecería en producción y sólo fuera de RD.
            //
            // Convención `getTimezoneOffset()` de JS (minutos a SUMAR a la hora local para llegar
            // a UTC: RD=+240, España verano=−120) — la misma que lee `user_tz_offset_min`. Las
            // DOS grafías, porque el lector acepta cualquiera y los otros dos escritores
            // persisten ambas.
            const _tzOffsetAhora = new Date().getTimezoneOffset();
            if (Number.isFinite(_tzOffsetAhora)) {
                hp.tzOffset = _tzOffsetAhora;
                hp.tz_offset_minutes = _tzOffsetAhora;
            }

            const r1 = await fetchWithAuth('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ health_profile: hp }),
            });
            // El mensaje del Error se pinta tal cual en el toast del catch.
            // [P1-PLAN-LOTE-164] Los errores PROPIOS llevan la marca `paraMostrar`: son los únicos que se pintan tal
            // cual. Lo demás (sin red, «Request timeout tras 30000ms: https://…», «Load failed») es texto técnico.
            if (!r1.ok) throw Object.assign(new Error(t('No se pudo guardar tu perfil.')), { paraMostrar: true });

            const r2 = await fetchWithAuth('/api/profile/plan-mode', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan_mode: 'tracking' }),
            });
            if (!r2.ok) throw Object.assign(new Error(t('No se pudo activar el modo contador.')), { paraMostrar: true });
            // [P1-PLAN-LOTE-292] Lo que toma, a su Alacena (fire-and-forget: el contador ya quedó listo).
            guardarSuplementosEnAlacena(hp, fetchWithAuth);

            safeLocalStorageSet('mealfit_plan_mode', 'tracking');

            // [P1-TRACKING-FINISH-BOUNCE · 2026-08-12] Hidratar el contexto ANTES de
            // navegar, y no es opcional: el PATCH de arriba escribió health_profile en
            // el SERVIDOR, pero el `userProfile` en memoria sigue siendo el de la
            // cuenta recién creada (health_profile vacío). Con ese estado,
            // ProtectedRoute calcula hasCompletedAssessment=false y rebota /dashboard
            // → /assessment en el mismo tick: el botón "no hacía nada" (el toast de
            // éxito salía porque el servidor SÍ guardó; el que mentía era el estado
            // local). Best-effort: si el refetch falla, navegamos igual — el espejo
            // localStorage ya quedó puesto y el rebote de hoy no es peor que abortar.
            try { await refreshProfileAndPlan(); } catch { /* best-effort */ }

            toast.success(t('Listo: tus metas están calculadas. Anota tu primera comida.'));
            navigate('/dashboard', { replace: true });
            // [137] Con plan vivo, el `planData` en memoria sigue diciendo el estado de ANTES de la pausa (y su sondeo
            // de bloques sigue vivo): la misma recarga que cierra el interruptor de Configuración (P1-PAUSE-STALE-PLANDATA).
            if (_conPlanVivo) setTimeout(() => window.location.reload(), 900);
        } catch (e) {
            toast.error(e?.paraMostrar
                ? e.message
                : t('No pudimos guardar tu contador. Revisa tu conexión e inténtalo de nuevo.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', alignItems: 'flex-start' }}>
            {/* [P1-PLAN-LOTE-166 · 2026-09-22] Decía «dashboard» (en español la app lo llama «panel») y que las preguntas
                saltadas «se preguntan ahí»: desde el lote 164 encender el plan pregunta SOLO lo que falta, y se hace desde
                la tarjeta del panel o desde Configuración. */}
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                {t('Con lo que respondiste calculamos tus calorías y macros diarios. Tu panel será tu contador: anota lo que comes, mira tu progreso y pregúntale al coach. Si algún día quieres el plan completo con recetas y lista de compras, lo enciendes desde tu panel o desde Configuración, y solo te preguntamos lo que falte.')}
            </p>
            <button
                type="button"
                data-hover="boton"
                onClick={terminar}
                disabled={saving}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                    background: 'var(--primary, #4F46E5)', color: '#fff', border: 0,
                    borderRadius: '0.8rem', padding: '0.8rem 1.6rem', fontSize: '1rem',
                    fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
                }}
            >
                {saving
                    ? (<><Loader2 size={18} className="animate-spin" /> {t('Preparando tu contador…')}</>)
                    : (<><Gauge size={18} /> {t('Empezar a contar')}</>)}
            </button>
        </div>
    );
};
