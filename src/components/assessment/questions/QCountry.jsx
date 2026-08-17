// [P1-COUNTRY-SYSTEM-F0 · 2026-08-16] ¿En qué país haces la compra?
//
// Clon estructural de QAppMode (el precedente P1-PLAN-MODE). El `value` de cada
// tarjeta es el CÓDIGO ISO del SSOT (config/countries.js) — el dato del motor;
// el label es texto que i18n traduce. Los países beta llevan su etiqueta y un
// subtítulo honesto: catálogo/reglas llegan con la Fase 2 de la spec
// 2026-08-16; hasta el flip global este paso ni se monta (COUNTRY_SYSTEM_UI).
//
// [P1-COUNTRY-SYSTEM-F2 · 2026-08-17, Addendum §4] El país SIGUE sin inferirse
// del OFFSET de la zona horaria: RD y Puerto Rico son ambos -240 los 365 días
// del año, serían indistinguibles. Lo que sí llegó en F2 es una PRESELECCIÓN
// por el NOMBRE de la zona IANA (`countryFromTimeZone`) — el paso se sigue
// preguntando, el radio solo nace marcado en la opción más probable.
import { useEffect, useRef } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { Globe2 } from 'lucide-react';
import { COUNTRIES, DEFAULT_COUNTRY, COUNTRY_SYSTEM_UI, countryFromTimeZone } from '../../../config/countries';
import { useT } from '../../../i18n';

export const QCountry = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    const value = formData.country || DEFAULT_COUNTRY;

    // [P1-COUNTRY-SYSTEM-F2 · 2026-08-17] Preselección por zona IANA del navegador
    // (Addendum §4 del dueño) — SUGIERE, nunca decide en silencio: el paso queda
    // visible y las 6 tarjetas siguen ahí; el usuario puede tocar cualquier otra en
    // cualquier momento. Corre UNA sola vez al montar (`preselectedRef` + deps `[]`
    // deliberadamente vacías): si reevaluara en cada cambio de `formData.country`
    // pisaría al usuario justo después de elegir algo. El guard usa `value` — el
    // mismo `formData.country || DEFAULT_COUNTRY` de arriba — para tratar IGUAL el
    // campo ausente y el 'DO' sembrado por `initialFormData`; cualquier OTRO valor
    // ya es una elección (propia o restaurada) y jamás se sobreescribe. Que un pick
    // EXPLÍCITO de DO sea indistinguible del default-sin-tocar es una ambigüedad
    // aceptada a propósito (Addendum: "simplest honest approach") — el efecto solo
    // puede volver a dispararse si el componente se REMONTA (p.ej. salir del paso y
    // volver), nunca dentro del mismo mount.
    //
    // Doble gate por COUNTRY_SYSTEM_UI: F0 ya evita que este componente se monte en
    // oscuro (InteractiveAssessmentFlow.jsx solo lo incluye en el array de pasos
    // tras el flip), pero el efecto se protege TAMBIÉN aquí — defensa en
    // profundidad si algún día alguien monta QCountry fuera de ese gate (test,
    // storybook, un refactor futuro que olvide el guard externo).
    const preselectedRef = useRef(false);
    useEffect(() => {
        if (preselectedRef.current) return;
        preselectedRef.current = true;
        if (!COUNTRY_SYSTEM_UI) return;
        if (value !== DEFAULT_COUNTRY) return;
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            updateData('country', countryFromTimeZone(tz));
        } catch {
            // best-effort: sin Intl/timeZone disponible el paso se queda en el
            // default visible y el usuario elige a mano — cero impacto funcional.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
