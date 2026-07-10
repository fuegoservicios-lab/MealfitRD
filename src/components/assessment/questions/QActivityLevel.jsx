// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { Armchair, Bike, Dumbbell, Footprints, Medal } from 'lucide-react';

export const QActivityLevel = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
                // Progresión visual de actividad física: cada icono
                // representa el TIPO de movimiento del nivel.
                //   - Armchair (Sedentario): silla = trabajo de escritorio.
                //   - Footprints (Ligero): pasos = caminar / actividad suave.
                //   - Bike (Moderado): bicicleta = cardio moderado.
                //   - Dumbbell (Activo): pesas = entrenamiento de fuerza.
                //   - Medal (Atleta): medalla = nivel competitivo.
                // Antes Ligero y Moderado compartían `Activity` (no se
                // distinguían) y User/TrendingUp/Target eran abstractos.
                { val: 'sedentary', label: 'Sedentario', desc: 'Trabajo de escritorio, poco o ningún ejercicio.', icon: Armchair },
                { val: 'light', label: 'Ligero', desc: 'Ejercicio suave de 1 a 3 días por semana.', icon: Footprints },
                { val: 'moderate', label: 'Moderado', desc: 'Ejercicio moderado de 3 a 5 días por semana.', icon: Bike },
                { val: 'active', label: 'Activo', desc: 'Deportes fuertes o ejercicio 6 a 7 días por semana.', icon: Dumbbell },
                { val: 'athlete', label: 'Atleta', desc: 'Entrenamientos dobles, trabajo físico demandante.', icon: Medal }
            ].map(opt => (
                <RadioCard
                    key={opt.val} name="activityLevel" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                    checked={formData.activityLevel === opt.val}
                    onChange={(e) => { updateData('activityLevel', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.activityLevel === opt.val) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};
