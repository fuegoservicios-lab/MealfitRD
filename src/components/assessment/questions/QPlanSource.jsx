// [P1-PANTRY-FIRST-PLAN · 2026-07-11] F3 — Primera pregunta del formulario: ¿plan
// completo diseñado libre por la IA, o plan construido a partir de lo que YA hay en
// tu Nevera? El modo 'pantry' activa: pre-flight determinista de factibilidad
// (con sugerencias de compra a precio RD si no alcanza) + generación Zero-Waste
// (el backend inyecta tu inventario real server-side).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { Bot, Refrigerator } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../../../i18n';

export const QPlanSource = ({ onAutoAdvance }) => {
    const { formData, updateData, isGuest } = useAssessment();
    const t = useT();
    // [feedback owner 2026-07-11] SIN default visual: pre-marcar "Plan completo" parecía
    // una elección ya tomada y confundía. Sin selección, "Siguiente" continúa y el
    // backend trata planSource ausente como generación libre (mismo comportamiento).
    const value = formData.planSource;
    // [P1-GUEST-ONE-DEFINITION · 2026-08-12] La definición de invitado es LA DEL
    // CONTEXTO (isGuest = modo invitado explícito), no Boolean(userProfile?.id):
    // un AUTENTICADO con el perfil aún en vuelo (fetchProfile 100-500ms) veía las
    // tarjetas grises con «Requiere cuenta» estando logueado, mientras el flow ya
    // lo trataba como autenticado — dos verdades en la misma pantalla.
    const isAuth = !isGuest;

    const set = (v) => updateData('planSource', v);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* [P1-PLANSOURCE-COPY-PARITY · 2026-08-09] Las etiquetas decían «Plan
                completo con IA» vs «Desde mi Nevera», y eso hacía dos afirmaciones
                falsas sin querer: que la segunda opción NO usa IA, y que es menos
                «completa». Las dos son IA y las dos dan un plan entero — el owner
                lo reportó como «no se entiende, las dos son con IA».

                Ahora ambas empiezan por «Que la IA», así que la pregunta de si hay
                IA ni siquiera se plantea, y el resto nombra el ÚNICO eje real: de
                dónde salen los ingredientes.

                [P1-PLAN-LOTE-418 · 2026-09-27] Decía «No mira tu Nevera», literal
                solo mientras el inventario se inyectara ÚNICAMENTE en modo `pantry`.
                Ya no es así: los bloques 2+ de cualquier plan refrescan la Nevera
                (`_refresh_chunk_pantry`), el cambio de plato la usa y «Actualizar
                platos» la pide. Lo cierto desde el primer día: elige libre y te da
                la lista. No vuelvas a negar la Nevera aquí. */}
            <RadioCard
                name="planSource" value="scratch" icon={Bot}
                label={t('Que la IA elija los ingredientes')}
                desc={t('Diseña tu plan libremente, con lo que mejor encaje en tus metas, y te da la lista para comprarlo.')}
                checked={value === 'scratch'}
                onChange={(e) => { set(e.target.value); onAutoAdvance(); }}
                onClick={() => { if (value === 'scratch') onAutoAdvance(); }}
            />
            <RadioCard
                name="planSource" value="pantry" icon={Refrigerator}
                label={t('Que la IA use lo que ya tengo')}
                desc={isAuth
                    ? t('Arma las comidas alrededor de tu Nevera: compras menos y aprovechas lo que ya está.')
                    : t('Requiere cuenta: tu Nevera vive en tu perfil. Inicia sesión para usar este modo.')}
                checked={value === 'pantry'}
                // [P1-PLANSOURCE-DEAD-CONTROL · 2026-08-10] Sin cuenta, tocar esta tarjeta
                // no hacía ABSOLUTAMENTE NADA: ni deshabilitada, ni aviso, ni cambio de
                // estilo. Y es la PRIMERA pantalla del formulario, que además no ofrece
                // salida alternativa (el botón de avanzar solo aparece con un paso ya
                // completado). Un invitado —o un revisor de tienda, que entra como
                // invitado— podía quedarse tocando un control mudo.
                // Ahora dice por qué no puede y adónde ir. La explicación ya estaba en la
                // descripción de la tarjeta; lo que faltaba era respuesta AL TOQUE.
                disabled={!isAuth}
                onChange={(e) => { if (isAuth) { set(e.target.value); onAutoAdvance(); } }}
                onClick={() => {
                    if (!isAuth) {
                        toast.info(t('Necesitas una cuenta para usar tu Nevera'), {
                            description: t('Tu Nevera vive en tu perfil. Inicia sesión y vuelve a este paso.'),
                            duration: 5000,
                        });
                        return;
                    }
                    if (value === 'pantry') onAutoAdvance();
                }}
            />
        </div>
    );
};
