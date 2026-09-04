// [P1-ARQ25-F4-FORM · 2026-09-03] Preguntas 4-6 del formulario progresivo (roadmap §6.7), en un
// solo paso OPCIONAL: reposición de frescos (solo si la compra principal es cada 15/30 días),
// congelador y cocinar por tandas. Sin respuesta NO se siembra un default en el formulario — el
// backend usa lo más habitual y lo declara en la política (lección P1-COUNTRY-SYSTEM-F0: un
// default sembrado es indistinguible de una elección).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { NextButton } from './NextButton';
import { Leaf, Ban, Snowflake, ThermometerSnowflake, Flame, UtensilsCrossed, Soup, CookingPot } from 'lucide-react';
import { useT } from '../../../i18n';
import { CYCLE_NEEDS_TOPUP, FREEZER_MODES, BATCH_MODES, freezerLabel, batchLabel } from '../../../config/planPolicy';

const Group = ({ id, title, children }) => (
    <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <legend id={id} style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)', padding: 0, marginBottom: '0.15rem' }}>
            {title}
        </legend>
        <div role="radiogroup" aria-labelledby={id}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' }}>
            {children}
        </div>
    </fieldset>
);

export const QShoppingHabits = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    const askTopup = CYCLE_NEEDS_TOPUP.includes(formData.groceryDuration);
    const pick = (field) => (e) => updateData(field, e.target.value);
    const freezerIcons = { none: Ban, limited: ThermometerSnowflake, full: Snowflake };
    const freezerDesc = { none: t('No congelo'), limited: t('Algunas cosas'), full: t('Lo que haga falta') };
    const batchIcons = { never: UtensilsCrossed, sometimes: Soup, often: CookingPot };
    const batchDesc = { never: t('Cada comida en su momento'), sometimes: t('Aprovecho sobras'), often: t('Varias porciones de una vez') };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {t('Con esto decidimos qué comprar fresco, qué guardar y cuántas porciones cocinar. Puedes dejarlo para después.')}
            </p>
            {askTopup && (
                <Group id="q-fresh-topup" title={t('¿Puedes reponer alimentos frescos entre compras?')}>
                    <RadioCard name="freshTopup" value="yes" label={t('Sí, cada semana')} desc={t('Frutas, vegetales y proteína fresca')} icon={Leaf}
                        checked={formData.freshTopup === 'yes'} onChange={pick('freshTopup')} />
                    <RadioCard name="freshTopup" value="no" label={t('No, solo la compra grande')} desc={t('Planificamos con lo que aguanta')} icon={Flame}
                        checked={formData.freshTopup === 'no'} onChange={pick('freshTopup')} />
                </Group>
            )}
            <Group id="q-freezer" title={t('¿Puedes y quieres congelar alimentos?')}>
                {FREEZER_MODES.map((mode) => (
                    <RadioCard key={mode} name="freezerMode" value={mode} label={freezerLabel(t, mode)} desc={freezerDesc[mode]} icon={freezerIcons[mode]}
                        checked={formData.freezerMode === mode} onChange={pick('freezerMode')} />
                ))}
            </Group>
            <Group id="q-batch" title={t('¿Sueles cocinar varias porciones a la vez?')}>
                {BATCH_MODES.map((mode) => (
                    <RadioCard key={mode} name="batchCooking" value={mode} label={batchLabel(t, mode)} desc={batchDesc[mode]} icon={batchIcons[mode]}
                        checked={formData.batchCooking === mode} onChange={pick('batchCooking')} />
                ))}
            </Group>
            <NextButton onClick={onManualAdvance} disabled={false} />
        </div>
    );
};
