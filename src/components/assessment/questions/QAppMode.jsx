// [P1-PLAN-MODE · 2026-08-11] Paso 0: ¿qué quieres que haga la app?
//
// NO es un tercer botón de QPlanSource, y las tres razones están medidas:
//  1. `planSource` es un enum binario ('scratch'|'pantry') que el backend lee como
//     «cualquier otro valor ⇒ generación libre»: un 'none' viajaría en el spread del
//     SSE y el backend GENERARÍA el plan (la forma de P1-DIET-CANON-SSOT: un valor
//     que nadie canonicaliza, tratado en silencio como el default).
//  2. Un radio group tiene UNA pregunta. La de QPlanSource es «¿de dónde salen los
//     ingredientes?» y «que no salgan» no la responde.
//  3. El interruptor tiene que ser EL MISMO objeto que el del dashboard: los crons no
//     leen formData, y los crons son donde se gasta el dinero. Este paso no ES el
//     interruptor — lo PULSA (PUT /api/profile/plan-mode) al terminar el formulario.
//
// Coste honesto: quien sí quiere plan da un tap más. A cambio, la primera pantalla
// por fin dice qué hace el producto.
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { CalendarRange, Gauge } from 'lucide-react';
import { toast } from 'sonner';

export const QAppMode = ({ onAutoAdvance }) => {
    const { formData, updateData, isGuest } = useAssessment();
    const value = formData.appMode;
    // [P1-GUEST-ONE-DEFINITION · 2026-08-12] La definición de invitado es LA DEL
    // CONTEXTO (isGuest = modo invitado explícito), no Boolean(userProfile?.id):
    // un AUTENTICADO con el perfil aún en vuelo (fetchProfile 100-500ms) veía las
    // tarjetas grises con «Requiere cuenta» estando logueado, mientras el flow ya
    // lo trataba como autenticado — dos verdades en la misma pantalla.
    const isAuth = !isGuest;

    const set = (v) => updateData('appMode', v);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <RadioCard
                name="appMode" value="plan" icon={CalendarRange}
                label="Plan de comidas completo"
                desc="La IA te arma el menú de cada día, con recetas y lista de compras."
                checked={value === 'plan'}
                onChange={(e) => { set(e.target.value); onAutoAdvance(); }}
                onClick={() => { if (value === 'plan') onAutoAdvance(); }}
            />
            <RadioCard
                name="appMode" value="tracking" icon={Gauge}
                label="Solo contar lo que como"
                desc={isAuth
                    ? 'Tus metas de calorías y macros, tu diario y el coach. Sin plan generado — lo enciendes cuando quieras.'
                    : 'Requiere cuenta: tu diario vive en tu perfil. Inicia sesión para usar este modo.'}
                checked={value === 'tracking'}
                // [P1-PLANSOURCE-DEAD-CONTROL] Sin cuenta, la tarjeta responde AL TOQUE
                // con el porqué — un invitado en modo contador tendría un panel donde
                // nada se puede registrar (/api/diary/consumed rechaza guests), y eso
                // es peor que no ofrecerlo.
                disabled={!isAuth}
                onChange={(e) => { if (isAuth) { set(e.target.value); onAutoAdvance(); } }}
                onClick={() => {
                    if (!isAuth) {
                        toast.info('Necesitas una cuenta para el modo contador', {
                            description: 'Tu diario vive en tu perfil. Inicia sesión y vuelve a este paso.',
                            duration: 5000,
                        });
                        return;
                    }
                    if (value === 'tracking') onAutoAdvance();
                }}
            />
        </div>
    );
};
