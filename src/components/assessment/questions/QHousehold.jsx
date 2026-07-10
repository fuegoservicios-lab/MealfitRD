// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { CalendarClock, CalendarDays, CalendarRange, Check, Clock } from 'lucide-react';
import { handleActivationKey } from './_shared';
import { NextButton } from './NextButton';

export const QHousehold = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();

    const handleDurationSelect = (val) => {
        updateData('groceryDuration', val);
        // [P1-12] Mismo patrón: el ciclo de compras es safety-relevante para
        // el escalado de la lista de compras (×2 quincenal, ×4 mensual).
        // Sin este flag, una mudanza/cambio de horario que el usuario tipea
        // en una pestaña podía ser revertida por sync de otra sesión.
        updateData('_groceryDurationTouched', true);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* --- Ciclo de Despensa --- */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Clock size={18} color="#059669" />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>¿Cada cuántos días vas al supermercado?</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                    {[
                        // Cada duración usa un icono lucide-react que
                        // comunica visualmente su rango temporal:
                        //   - CalendarDays (semanal): días de la semana
                        //     visibles como filas — sugiere granularidad
                        //     diaria.
                        //   - CalendarRange (quincenal): rango con dos
                        //     extremos marcados — sugiere "2 semanas".
                        //   - CalendarClock (mensual): calendario + reloj —
                        //     sugiere "más tiempo entre compras".
                        { val: 'weekly', label: '7 Días', sub: 'Semanal', Icon: CalendarDays },
                        { val: 'biweekly', label: '15 Días', sub: 'Quincenal', Icon: CalendarRange },
                        { val: 'monthly', label: '30 Días', sub: 'Mensual', Icon: CalendarClock },
                    ].map(opt => {
                        const isSelected = formData.groceryDuration === opt.val;
                        const IconCmp = opt.Icon;
                        return (
                            <div
                                key={opt.val}
                                onClick={() => handleDurationSelect(opt.val)}
                                onKeyDown={handleActivationKey(() => handleDurationSelect(opt.val))}
                                role="button"
                                aria-pressed={isSelected}
                                tabIndex={0}
                                style={{
                                    cursor: 'pointer',
                                    padding: '1rem 0.75rem',
                                    borderRadius: '0.75rem',
                                    border: isSelected ? '2px solid #10B981' : '1.5px solid var(--border)',
                                    backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                    boxShadow: isSelected ? '0 4px 12px rgba(16, 185, 129, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)'
                                }}
                            >
                                <IconCmp
                                    size={26}
                                    strokeWidth={1.75}
                                    color={isSelected ? '#10B981' : 'var(--text-muted)'}
                                />
                                <span style={{
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    color: isSelected ? '#10B981' : 'var(--text-main)'
                                }}>
                                    {opt.label}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    {opt.sub}
                                </span>
                                {isSelected && (
                                    <div style={{ position: 'absolute', top: 6, right: 6, color: '#10B981' }}>
                                        <Check size={14} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Nota informativa */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                padding: '0.75rem 1rem', borderRadius: '0.75rem',
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)'
            }}>
                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>💡</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Si cambia tu rutina, lo ajustas en tu panel sin regenerar el plan.
                </span>
            </div>
            <NextButton onClick={onManualAdvance} disabled={!formData.groceryDuration} />
        </div>
    );
};
