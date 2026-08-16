// [P1-COUNTRY-SYSTEM-F0 · 2026-08-16] ¿En qué país haces la compra?
//
// Clon estructural de QAppMode (el precedente P1-PLAN-MODE). El `value` de cada
// tarjeta es el CÓDIGO ISO del SSOT (config/countries.js) — el dato del motor;
// el label es texto que i18n traduce. Los países beta llevan su etiqueta y un
// subtítulo honesto: catálogo/reglas llegan con la Fase 2 de la spec
// 2026-08-16; hasta el flip global este paso ni se monta (COUNTRY_SYSTEM_UI).
//
// El país NO se infiere de la zona horaria: RD y Puerto Rico son ambos -240
// los 365 días del año. Se pregunta.
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { Globe2 } from 'lucide-react';
import { COUNTRIES } from '../../../config/countries';
import { useT } from '../../../i18n';

export const QCountry = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    const value = formData.country || 'DO';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {COUNTRIES.map((c) => (
                <RadioCard
                    key={c.code}
                    name="country"
                    value={c.code}
                    icon={Globe2}
                    label={c.beta ? `${t(c.labelKey)} · ${t('Beta')}` : t(c.labelKey)}
                    desc={c.beta
                        ? t('Adaptamos tu plan a tu cocina local. Los precios del súper de tu país llegan pronto — tu lista de compras saldrá sin importes.')
                        : t('Catálogo nativo: precios del súper, platos criollos y medidas locales.')}
                    checked={value === c.code}
                    onChange={(e) => { updateData('country', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (value === c.code) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};
