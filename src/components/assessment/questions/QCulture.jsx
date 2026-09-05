// [P1-ARQ25-F7-CULTURE · 2026-09-05] «¿Qué cocina quieres en tu mesa?» (Fase 7, roadmap 2.5 §9 e I16).
//
// La cocina va SEPARADA del país de compra: aquí se elige QUÉ platos inspiran el plan; el país
// (QCountry, el paso anterior) decide precios, catálogo, moneda y medidas. Una principal (manda en
// al menos la mitad de los días) y hasta dos secundarias con intensidad. Nada se infiere del origen,
// del idioma ni de la zona horaria: la cocina del país de compra se marca como «Sugerida», pero no
// se siembra — el paso es OBLIGATORIO (pedido del dueño 2026-09-05) y la persona tiene que tocarla
// (lección P1-COUNTRY-SYSTEM-F0: un default sembrado es indistinguible de una elección).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { ChipOption } from './_shared';
import { NextButton } from './NextButton';
import { Globe2 } from 'lucide-react';
import { COUNTRY_FLAGS } from '../../common/CountryFlags';
import { useT } from '../../../i18n';
import {
    CULTURES, CULTURE_INTENSITIES, INTENSITY_SHARE, DEFAULT_INTENSITY, MAX_SECONDARY_CULTURES,
    cultureForCountry, cultureHints, cultureLabel, normalizeCultureProfiles,
} from '../../../config/cultures';

// Las banderas de `CountryFlags` llenan el 100 % de su contenedor (están pensadas para el iconChip de
// 52 px de RadioCard, que sí las acota); `ChipOption` les pasa `size={18}` como a un icono lucide y lo
// ignoran, así que en el chip salían a pantalla completa. Envoltorio circular de tamaño fijo, con
// identidad estable por cocina (creado una vez en módulo, no en cada render).
const makeChipFlag = (Flag) => {
    const ChipFlag = ({ size = 18 }) => (
        <span aria-hidden="true" style={{ width: size, height: size, flex: '0 0 auto', display: 'inline-flex', borderRadius: '50%', overflow: 'hidden' }}>
            <Flag />
        </span>
    );
    return ChipFlag;
};
const CHIP_FLAGS = Object.fromEntries(CULTURES.map((c) => [c.id, makeChipFlag(COUNTRY_FLAGS[c.marketDefault] || Globe2)]));

const pillStyle = (on) => ({
    padding: '0.4rem 0.75rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', border: on ? '1.5px solid var(--primary)' : '1px solid var(--border)',
    background: on ? 'color-mix(in srgb, var(--primary) 16%, transparent)' : 'var(--bg-card)',
    color: on ? 'var(--primary)' : 'var(--text-main)',
});

const legendStyle = { fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)', padding: 0, marginBottom: '0.15rem' };

export const QCulture = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    const chosen = normalizeCultureProfiles(formData.cultureProfiles);
    const suggested = cultureForCountry(formData.country);
    const main = chosen?.main || null;
    const secondary = chosen?.secondary || [];
    const hints = cultureHints(t);
    const secondaryIds = secondary.map((s) => s.profile_id);
    const full = secondary.length >= MAX_SECONDARY_CULTURES;
    // etiqueta de intensidad en lenguaje llano + su parte aproximada de las comidas
    const intensityText = {
        ocasional: t('De vez en cuando'), frecuente: t('A menudo'), predominante: t('Mucho'),
    };

    const pickMain = (id) => {
        updateData('cultureProfiles', { main: id, secondary: secondary.filter((s) => s.profile_id !== id) });
    };
    const toggleSecondary = (id) => {
        if (!main) return;
        if (secondaryIds.includes(id)) {
            updateData('cultureProfiles', { main, secondary: secondary.filter((s) => s.profile_id !== id) });
            return;
        }
        if (full) return;
        updateData('cultureProfiles', { main, secondary: [...secondary, { profile_id: id, intensity: DEFAULT_INTENSITY }] });
    };
    const setIntensity = (id, intensity) => {
        updateData('cultureProfiles', { main, secondary: secondary.map((s) => (s.profile_id === id ? { ...s, intensity } : s)) });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {t('Tú decides. Los precios y el súper siguen siendo los de tu país.')}
            </p>

            <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <legend id="q-culture-main" style={legendStyle}>
                    {t('Tu cocina principal')}&nbsp;<span style={{ color: '#EF4444' }}>*</span>
                </legend>
                <div role="radiogroup" aria-labelledby="q-culture-main" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {CULTURES.map((c) => {
                        const isSuggested = !main && c.id === suggested;
                        return (
                            <RadioCard
                                key={c.id}
                                name="cultureMain"
                                value={c.id}
                                icon={COUNTRY_FLAGS[c.marketDefault] || Globe2}
                                label={isSuggested ? (
                                    <>
                                        {t(c.labelKey)}
                                        <span style={{ marginLeft: '0.5rem', padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                                            background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)', verticalAlign: 'middle' }}>
                                            {t('Sugerida')}
                                        </span>
                                    </>
                                ) : t(c.labelKey)}
                                desc={hints[c.id]}
                                checked={main === c.id}
                                onChange={() => pickMain(c.id)}
                            />
                        );
                    })}
                </div>
            </fieldset>

            <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem', opacity: main ? 1 : 0.55 }}>
                <legend id="q-culture-secondary" style={legendStyle}>
                    {t('¿Sumas otra cocina?')} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{t('(opcional, hasta {n})', { n: MAX_SECONDARY_CULTURES })}</span>
                </legend>
                <div aria-labelledby="q-culture-secondary" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                    {CULTURES.filter((c) => c.id !== main).map((c) => {
                        const on = secondaryIds.includes(c.id);
                        return (
                            <ChipOption
                                key={c.id}
                                val={c.id}
                                label={t(c.labelKey)}
                                icon={CHIP_FLAGS[c.id]}
                                isSelected={on}
                                disabled={!main || (!on && full)}
                                onToggle={toggleSecondary}
                            />
                        );
                    })}
                </div>
                {secondary.map((s) => (
                    <div key={s.profile_id} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            {t('¿Cuánta {cocina}?', { cocina: cultureLabel(t, s.profile_id) })}
                        </span>
                        <div role="radiogroup" aria-label={t('Intensidad de {cocina}', { cocina: cultureLabel(t, s.profile_id) })} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {CULTURE_INTENSITIES.map((level) => (
                                <button key={level} type="button" role="radio" aria-checked={s.intensity === level} style={pillStyle(s.intensity === level)}
                                    onClick={() => setIntensity(s.profile_id, level)}>
                                    {intensityText[level]} · {INTENSITY_SHARE[level]} %
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.45 }}>
                    {t('Tu cocina principal lleva al menos la mitad de tus comidas.')}
                </p>
            </fieldset>

            <NextButton onClick={onManualAdvance} disabled={!main} label={main ? undefined : t('Elige tu cocina principal')} />
        </div>
    );
};
