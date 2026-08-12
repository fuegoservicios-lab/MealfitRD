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
import { useAssessment } from '../../../context/AssessmentContext';
import { TRACKING_REQUIRED_FIELDS } from '../../../config/formValidation';

export const QTrackingFinish = () => {
    const navigate = useNavigate();
    const { formData, refreshProfileAndPlan } = useAssessment();
    const [saving, setSaving] = useState(false);

    const terminar = async () => {
        if (saving) return;
        setSaving(true);
        try {
            // Solo los campos del contrato de seguimiento + los acompañantes que el
            // usuario haya llenado. Los 12 pasos saltados NO se rellenan con nada:
            // inventar un cookingTime hoy es un plan mal calibrado en tres meses
            // (las cicatrices P0-FORM-1/-4/-5 son exactamente esa clase).
            const hp = {};
            for (const campo of TRACKING_REQUIRED_FIELDS) {
                if (formData[campo] !== undefined && formData[campo] !== null) hp[campo] = formData[campo];
            }
            for (const extra of ['otherAllergy', 'otherCondition', 'goalWeight', 'goalPace', 'bodyFat']) {
                if (formData[extra]) hp[extra] = formData[extra];
            }

            const r1 = await fetchWithAuth('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ health_profile: hp }),
            });
            if (!r1.ok) throw new Error('No se pudo guardar tu perfil.');

            const r2 = await fetchWithAuth('/api/profile/plan-mode', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan_mode: 'tracking' }),
            });
            if (!r2.ok) throw new Error('No se pudo activar el modo contador.');

            try { localStorage.setItem('mealfit_plan_mode', 'tracking'); } catch { /* noop */ }

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

            toast.success('Listo: tus metas están calculadas. Anota tu primera comida.');
            navigate('/dashboard', { replace: true });
        } catch (e) {
            toast.error(e?.message || 'No se pudo terminar. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Con lo que respondiste calculamos tus calorías y macros diarios. Tu
                dashboard será tu contador: anota lo que comes, mira tu progreso y
                pregúntale al coach. Si algún día quieres el plan completo con recetas
                y lista de compras, lo enciendes desde el mismo dashboard — las
                preguntas que te saltaste se preguntan ahí, no se inventan.
            </p>
            <button
                type="button"
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
                    ? (<><Loader2 size={18} className="animate-spin" /> Preparando tu contador…</>)
                    : (<><Gauge size={18} /> Empezar a contar</>)}
            </button>
        </div>
    );
};
