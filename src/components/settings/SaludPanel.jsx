// [P1-PLAN-LOTE-719 · 2026-09-28] Configuración → «Alergias y dieta».
//
// El coach le dice al usuario «cámbialo desde Configuración» (tools.py) y el propio diseño de las alergias
// acumulativas lo da por hecho: «RETIRAR una alergia sigue siendo posible: el usuario la desmarca en
// Configuración». Esa pantalla no existía. Una alergia añadida por error desde el chat solo se podía quitar con
// «Empezar desde cero», que lo borra todo.
//
// Aquí se reutilizan LAS MISMAS preguntas del formulario (QDietType, QAllergies, QMedical) con su validación de
// seguridad intacta —«Ninguna» explícito, el alcance clínico de P1-MEDICAL-SCOPE-GATE—; solo cambia el botón, que
// guarda en vez de avanzar. Cada grupo guarda SUS claves y nada más (un PATCH con el formulario entero es lo que
// borraba alergias añadidas desde otro dispositivo, P1-PLAN-LOTE-715).
//
// Dos reglas de coherencia:
//   · Al abrir, el editor parte de lo que tiene el SERVIDOR, no de la copia local (que solo se rellena cuando está
//     vacía y puede ser vieja).
//   · Al salir sin guardar, el formulario local vuelve a lo guardado: un borrador abandonado aquí no debe viajar en la
//     siguiente renovación del plan. Configuración pregunta antes de descartarlo (`onDirtyChange`).
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAssessment } from '../../context/AssessmentContext';
import { useT } from '../../i18n';
import { QAllergies } from '../assessment/questions/QAllergies';
import { QMedical } from '../assessment/questions/QMedical';
import { QDietType } from '../assessment/questions/QDietType';

const GRUPOS = Object.freeze({
    dieta: ['dietType'],
    alergias: ['allergies', 'otherAllergies'],
    condiciones: ['medicalConditions', 'otherConditions', 'medications', 'otherMedications'],
});
const TODAS = [...GRUPOS.dieta, ...GRUPOS.alergias, ...GRUPOS.condiciones];

const igual = (a, b) => {
    try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); } catch { return false; }
};

export default function SaludPanel({ onDirtyChange }) {
    const t = useT();
    const { formData, updateData, userProfile, updateUserProfile } = useAssessment();
    // Lo guardado en el servidor (al abrir, y tras cada guardado). Es contra lo que se mide «sin guardar».
    const baseRef = useRef(null);
    const formDataRef = useRef(formData);
    formDataRef.current = formData;
    const [version, setVersion] = useState(0);
    const [guardando, setGuardando] = useState(null);
    const [autoDieta, setAutoDieta] = useState(0);

    useEffect(() => {
        const hp = userProfile?.health_profile || {};
        const base = {};
        for (const k of TODAS) {
            const delServidor = hp[k];
            base[k] = delServidor !== undefined ? delServidor : formDataRef.current?.[k];
            if (delServidor !== undefined && !igual(formDataRef.current?.[k], delServidor)) updateData(k, delServidor);
        }
        baseRef.current = base;
        setVersion((n) => n + 1);
        return () => {
            const b = baseRef.current;
            if (!b) return;
            for (const k of TODAS) {
                if (!igual(formDataRef.current?.[k], b[k])) updateData(k, b[k]);
            }
        };
        // Solo al abrir: después, la verdad del editor es lo que el usuario toca.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cambiado = (grupo) => Boolean(baseRef.current) && GRUPOS[grupo].some((k) => !igual(formData?.[k], baseRef.current[k]));
    const dirty = version > 0 && (cambiado('dieta') || cambiado('alergias') || cambiado('condiciones'));

    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
    useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

    const guardar = useCallback(async (grupo) => {
        if (guardando) return;
        const actual = formDataRef.current || {};
        const patch = {};
        for (const k of GRUPOS[grupo]) {
            if (actual[k] !== undefined) patch[k] = actual[k];
        }
        if (!Object.keys(patch).length) return;
        setGuardando(grupo);
        const r = await updateUserProfile({ health_profile: patch });
        setGuardando(null);
        if (r?.success) {
            baseRef.current = { ...baseRef.current, ...patch };
            setVersion((n) => n + 1);
            toast.success({
                dieta: t('Dieta guardada. Se aplica a tus próximos bloques del plan.'),
                alergias: t('Alergias guardadas. Tus próximos bloques del plan ya las respetan.'),
                condiciones: t('Condiciones médicas guardadas. Se aplican a tus próximos bloques del plan.'),
            }[grupo]);
        } else {
            toast.error(t('No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.'));
        }
    }, [guardando, updateUserProfile, t]);

    // La dieta se guarda al elegirla: `QDietType` avisa ANTES de que el estado nuevo exista, así que se espera al
    // siguiente render para leerlo.
    useEffect(() => {
        if (autoDieta && cambiado('dieta')) guardar('dieta');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoDieta, formData?.dietType]);

    if (!baseRef.current) return null;

    const subtitulo = { fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.4rem' };
    const ayuda = { color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.5, margin: '0 0 1rem' };

    return (
        <div data-salud-panel style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <p style={{ ...ayuda, margin: 0 }}>
                {t('Los cambios se aplican a tus próximos bloques del plan. Si tu plan actual tiene algo que ya no puedes comer, cámbialo con «Cambiar Plato».')}
            </p>

            <section aria-labelledby="salud-dieta">
                <h3 id="salud-dieta" style={subtitulo}>{t('Tipo de dieta')}</h3>
                <p style={ayuda}>{t('Se guarda al elegirla.')}</p>
                <QDietType onAutoAdvance={() => setAutoDieta((n) => n + 1)} />
            </section>

            <section aria-labelledby="salud-alergias">
                <h3 id="salud-alergias" style={subtitulo}>{t('Alergias e intolerancias')}</h3>
                <p style={ayuda}>{t('Lo que tu plan nunca debe incluir. Si no tienes ninguna, marca «Ninguna».')}</p>
                <QAllergies
                    onManualAdvance={() => guardar('alergias')}
                    nextLabel={guardando === 'alergias' ? t('Guardando...') : t('Guardar alergias')}
                />
            </section>

            <section aria-labelledby="salud-condiciones">
                <h3 id="salud-condiciones" style={subtitulo}>{t('Condiciones médicas y medicamentos')}</h3>
                <QMedical
                    onManualAdvance={() => guardar('condiciones')}
                    nextLabel={guardando === 'condiciones' ? t('Guardando...') : t('Guardar condiciones')}
                />
            </section>

            {dirty && (
                <p role="status" style={{ ...ayuda, margin: 0, color: 'var(--warning-text)' }}>
                    {t('Tienes cambios sin guardar en esta sección.')}
                </p>
            )}
        </div>
    );
}
