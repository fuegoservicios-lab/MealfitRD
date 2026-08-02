import { useState, lazy, Suspense, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import { Check } from 'lucide-react';
import styles from './Pricing.module.css';
// [P5-SPEED-PAYMENTMODAL-LAZY · 2026-06-01] PaymentModal arrastra el wrapper
// @paypal/react-paypal-js (chunk ~22KB). Como Pricing se importa al cargar el
// landing (Home), el import estático emitía un <link modulepreload> de ese chunk
// en cada visita al landing aunque el 99% de los visitantes nunca abre el modal.
// Lazy + gate por `isPaymentOpen` → el chunk se baja solo al abrir el checkout.
// PaymentModal ya retornaba null cuando !isOpen (y solo entonces monta el
// PayPalScriptProvider), así que el comportamiento visible es idéntico.
const PaymentModal = lazy(() => import('../../components/dashboard/PaymentModal'));

// --- Configuración de precios ---
const PRICING = {
    basic: {
        monthly: { price: '9.99', label: '/mes' },
        annual:  { price: '89.99', label: '/año', monthlyEquiv: '7.50' },
    },
    plus: {
        monthly: { price: '19.99', label: '/mes' },
        annual:  { price: '179.99', label: '/año', monthlyEquiv: '15.00' },
    },
    ultra: {
        monthly: { price: '49.99', label: '/mes' },
        annual:  { price: '449.99', label: '/año', monthlyEquiv: '37.50' },
    },
};

// [ULTRA-MONTHLY-ONLY · 2026-06-19] Ultra no se ofrece en facturación anual —
// siempre se factura mensual. El toggle "Anual" no aplica a esta tarjeta: cae a
// su precio mensual y el checkout fuerza 'monthly'.
// [P1-CREDITS-LADDER + P1-LAUNCH-OFFER · 2026-07-31] Créditos por tier y
// anclaje de precio de lanzamiento — SSOT compartido con Upgrade.jsx.
// `includesPredecessor` sale del import: la cadena «Todo lo incluido en X» ya no
// se pinta aquí (ver SHARED_FEATURES). Sigue exportada porque `Upgrade.jsx` —el
// panel de un usuario que YA paga y compara contra su escalón actual— sí la usa,
// y ahí la recursión no existe: solo se muestran los tiers por encima del suyo.
import {
    ANNUAL_DISABLED_TIERS, LAUNCH_OFFER, TIER_CREDITS, TIER_DISPLAY_NAME,
    creditsVsPredecessor,
} from '../../config/plans';

// [PAY-MODAL-PERSIST · 2026-06-18] Nombre de plan por tier (SSOT local) para
// re-derivar el `name` del modal al rehidratarlo desde la URL tras un refresh.
const NAME_BY_TIER = {
    basic: 'Suscripción Básico',
    plus: 'Suscripción Plus',
    ultra: 'Suscripción Max',
};

// [P2-TIER-DISPLAY-NAME · 2026-07-31] Nombre comercial por tier — SSOT en
// `config/plans.js`, compartido con Upgrade.jsx.
const DISPLAY_BY_TIER = TIER_DISPLAY_NAME;

/* [P1-PRICING-TABLE-ROWS · 2026-08-02] LAS CUATRO COLUMNAS SE DERIVAN DE ESTE
   ARRAY, no se escriben a mano.
   ────────────────────────────────────────────────────────────────────────────
   Antes eran cuatro bloques JSX gemelos de ~45 líneas. Medido en producción a
   1440px, la regla separadora de cada celda caía a TRES alturas distintas
   (227,2 / 274 / 298 px desde el borde de la tarjeta) porque cada columna
   acumulaba un número distinto de líneas por encima: Gratis no tenía línea de
   `monthlyEquiv` y la descripción de Plus ocupaba 3 líneas contra 2 de sus
   hermanas. En una tabla reglada —que es lo que el sistema dice que esto es—
   la línea horizontal ES la fila; a tres alturas deja de haber tabla.

   Cuatro copias del mismo bloque garantizan que un día divergan. Este array lo
   cierra por construcción: si mañana alguien añade una fila, la añade a las
   cuatro o a ninguna. */
const TIER_ROWS = [
    {
        key: 'gratis',
        blurb: 'Empieza con todo: el plan completo, las recetas, el asistente y la nevera.',
        extras: [],
    },
    {
        key: 'basic',
        blurb: 'Más créditos para regenerar platos y días sin miedo a quedarte corto.',
        extras: [],
    },
    {
        key: 'plus',
        popular: true,
        // Acortado de «…ajusta, regenera y experimenta toda la semana»: era la
        // única de las cuatro que envolvía a 3 líneas. No desalineaba nada (el
        // botón va anclado abajo), pero en una tabla cuyo argumento entero es la
        // rejilla, una columna con un renglón de más se lee como un descuadre.
        blurb: 'Combustible de sobra: ajusta y regenera toda la semana.',
        extras: [],
    },
    {
        key: 'ultra',
        blurb: 'El tope más alto: para quien ajusta y optimiza su plan todos los días.',
        extras: ['Acceso anticipado a nuevas funciones', 'Soporte prioritario'],
    },
];

/* [P1-PRICING-TABLE-ROWS · 2026-08-02] LO QUE NO VARÍA SE DICE UNA VEZ.
   ────────────────────────────────────────────────────────────────────────────
   Estas siete funciones vivían dentro de la tarjeta Gratis, y las tres pagas
   se remitían a ella en cadena («Todo lo incluido en Gratis» → «…en Básico» →
   «…en Plus»). Dos consecuencias, las dos malas:

   1. La columna MÁS BARATA era la que más ofrecía a la vista — nueve marcas de
      verificación contra tres. El orden de lectura decía lo contrario de lo
      que vende la página.
   2. Para saber qué trae Max había que resolver tres saltos de recursión
      mentalmente. Nadie hace eso; se asume y se asume mal.

   La directiva del owner [P3-PRICING-HONEST-COPY · 2026-07-12] es que Gratis
   accede a TODAS las funciones y que los tiers se separan solo por créditos.
   Dicho una vez y a todo el ancho, eso es el argumento más fuerte de la
   página. Repartido en cuatro columnas era ruido que la contradecía.

   Lo que SÍ varía por columna se queda en la columna: la cifra de créditos, su
   salto contra el escalón anterior, y los dos extras reales de Max (que no son
   funciones del producto sino acceso y soporte — por eso no entran aquí). */
const SHARED_FEATURES = [
    'Plan de comidas con IA',
    'Recetas paso a paso',
    'Lista de compras PDF',
    'Analizador de macros',
    'Asistente IA con visión',
    'Nevera inteligente',
    'Seguimiento de progreso',
];

const Pricing = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const {
        PLAN_LIMIT,
        planData,
        upgradeUserPlan,
        userProfile,
        isGuest,
        session,
        loadingAuth,
    } = useAssessment();

    // Estado para controlar billing period y modal
    const [billingPeriod, setBillingPeriod] = useState('monthly'); // 'monthly' | 'annual'
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);

    const isAnnual = billingPeriod === 'annual';

    // [ULTRA-MONTHLY-ONLY · 2026-06-19] Anual efectivo POR tier: Ultra queda
    // excluido del anual aunque el toggle global esté en "Anual".
    const isAnnualForTier = (tier) => isAnnual && !ANNUAL_DISABLED_TIERS.has(tier);

    // Lógica para determinar el estado del usuario
    const hasStarted = !!planData;
    const rawTier = (userProfile?.plan_tier || '').toLowerCase().trim(); // Ensure lowercase
    const currentTier = ['gratis', 'basic', 'plus', 'ultra', 'admin'].includes(rawTier) ? rawTier : 'gratis';
    
    // Jerarquía de planes
    const tierRank = { gratis: 1, basic: 2, plus: 3, ultra: 4, admin: 5 };
    const currentRank = tierRank[currentTier] || 1;

    // [P2-PRICING-PROFILE-LOADING · 2026-05-31] Mientras userProfile no hidrate,
    // tratamos los botones como "cargando" (disabled) en vez de la rama invitado
    // que mostraba upgrades/downgrades activos e incorrectos durante la ventana
    // de carga (un usuario Plus/Ultra veía todas las tarjetas pagas clickeables).
    // [P1-GUEST-PRICING · 2026-06-21] PERO un INVITADO nunca tiene userProfile (no
    // hidrata jamás) → sin el guard de isGuest los botones quedaban atascados en
    // "Cargando…" para siempre. Para invitado el estado está RESUELTO (no hay perfil
    // que cargar): isProfileLoading=false → muestra "Invitado"/CTA de registro.
    // [P1-PRICING-ANON-LOADING · 2026-07-01] El guard `!isGuest` NO cubría al visitante
    // ANÓNIMO (sin sesión Y sin modo invitado): `isGuest = !session && guestFlag` es false
    // para él, así que `!isGuest && !userProfile?.id` quedaba true → los 4 botones decían
    // "Cargando…" para siempre (todo visitante frío que scrollea a precios lo veía roto).
    // Fix: "Cargando…" SOLO mientras la auth resuelve (`loadingAuth`, ventana breve común
    // a todos) O cuando ya hay sesión pero el perfil aún no hidrata (carga real del usuario
    // logueado). Una vez resuelta la auth sin sesión, `noSession` (anónimo O invitado)
    // resuelve a los CTA de gratis/registro — ninguno tiene perfil que esperar. El
    // `loadingAuth ||` evita además que un logueado parpadee el CTA anónimo en el mount.
    const noSession = !session;
    const isProfileLoading = loadingAuth || (!noSession && !userProfile?.id);

    // Helper: obtener precio actual según billing period (tier-aware: Ultra
    // siempre mensual, ver ANNUAL_DISABLED_TIERS).
    const getPrice = (tier) => PRICING[tier]?.[isAnnualForTier(tier) ? 'annual' : 'monthly']?.price || '0';
    const getPeriodLabel = (tier) => PRICING[tier]?.[isAnnualForTier(tier) ? 'annual' : 'monthly']?.label || '';
    const getMonthlyEquiv = (tier) => PRICING[tier]?.annual?.monthlyEquiv;

    /* [P1-PRICING-TABLE-ROWS · 2026-08-02] La línea bajo la cifra: SIEMPRE una
       sola línea y SIEMPRE presente, en las cuatro columnas y en los dos
       periodos. De eso depende que la regla separadora caiga a la misma altura.

       Antes esta fila (a) no existía en Gratis, que no tiene precio futuro que
       tachar, y (b) en las tres pagas repetía la MISMA frase de 2 líneas —
       «Precio de lanzamiento — sube el 15 de septiembre»— palabra por palabra.
       Seis líneas de tabla para decir tres veces lo mismo y un hueco de 47px en
       la cuarta columna.

       Ahora Gratis dice lo único que a esa columna le hace falta decir, y las
       pagas usan `deadlineShort` — el campo que `config/plans.js` creó
       exactamente para esto («columnas estrechas: un texto largo que no cabe
       empuja el ancho de su columna y desbalancea la grid — pasó en prod») y
       que esta página nunca llegó a usar.

       El orden de las ramas importa: Max bajo el toggle «Anual» NO entra en la
       primera (`isAnnualForTier` lo excluye, ANNUAL_DISABLED_TIERS) y cae a la
       segunda, que es la que le corresponde. */
    const priceNote = (tier) => {
        if (tier === 'gratis') return 'Gratis para siempre';
        if (isAnnualForTier(tier)) return `≈ USD$${getMonthlyEquiv(tier)} al mes`;
        if (isAnnual) return 'Solo en facturación mensual';
        if (LAUNCH_OFFER.active) {
            return `Sube a USD$${LAUNCH_OFFER.futureMonthly[tier]} · ${LAUNCH_OFFER.deadlineShort}`;
        }
        return 'Facturación mensual';
    };

    /* Créditos de la columna. Gratis lee `PLAN_LIMIT` del contexto (el valor que
       el backend hace cumplir de verdad) y no `TIER_CREDITS.gratis`; las pagas
       leen el SSOT compartido. Así estaba antes y así se queda: cambiar Gratis
       a la constante haría que la tarjeta prometiera un número que la app
       podría no estar aplicando. */
    const quotaOf = (tier) => (tier === 'gratis' ? PLAN_LIMIT : TIER_CREDITS[tier]);

    /* La fila del salto. En Gratis no hay escalón anterior —`creditsVsPredecessor`
       devuelve `null` a propósito, «nunca se inventa un salto»— así que la fila
       lleva el dato que de verdad decide en esa columna.

       Dice «No pide tarjeta» y no «Sin tarjeta de crédito», que es lo que
       escribí primero: esta fila cuelga literalmente de la cifra «10
       CRÉDITOS/MES», y ahí la palabra «crédito» ya significa otra cosa. Dos
       acepciones distintas a dos líneas de distancia obligan al lector a
       desambiguar en la columna que existe para no hacerle pensar. */
    const quotaDelta = (tier) =>
        (tier === 'gratis' ? 'No pide tarjeta' : creditsVsPredecessor(tier));

    // Manejador del botón Plan Gratis
    const handleFreePlanClick = () => {
        window.scrollTo(0, 0);
        if (hasStarted) {
            navigate('/dashboard');
        } else {
            navigate('/assessment');
        }
    };

    // Manejador del botón Planes Pagos
    const handleUpgradeClick = (tier, name) => {
        // [P1-GUEST-PRICING · 2026-06-21 · P1-PRICING-ANON-LOADING 2026-07-01] Sin sesión
        // (invitado O visitante anónimo) debe crear cuenta antes de suscribirse (el
        // checkout/verify requiere auth). Redirige a registro. Antes solo cubría `isGuest`;
        // un anónimo caía al checkout sin auth y el verify fallaba.
        if (noSession) {
            window.scrollTo(0, 0);
            navigate('/register');
            return;
        }
        const targetRank = tierRank[tier] || 1;

        // Validacion de seguridad (aunque el boton este disabled)
        if (targetRank <= currentRank) {
            window.scrollTo(0, 0);
            navigate('/dashboard');
            return;
        }
        const price = getPrice(tier);
        // [ULTRA-MONTHLY-ONLY · 2026-06-19] El periodo efectivo del checkout es
        // tier-aware: Ultra siempre 'monthly' aunque el toggle esté en "Anual".
        const annual = isAnnualForTier(tier);
        const periodSuffix = annual ? ' (Anual)' : ' (Mensual)';
        setSelectedPlan({ tier, price, name: name + periodSuffix, isAnnual: annual });
        setIsPaymentOpen(true);
        // [PAY-MODAL-PERSIST · 2026-06-18] Persistir el checkout en la URL para que
        // sobreviva un refresh (re-abre el modal en mount). replace → no ensucia el
        // history con cada click ni dispara el landing-skip POP.
        setSearchParams((prev) => {
            const p = new URLSearchParams(prev);
            p.set('checkout', tier);
            p.set('billing', annual ? 'annual' : 'monthly');
            return p;
        }, { replace: true });
    };

    // [PAY-MODAL-PERSIST · 2026-06-18] Cierre centralizado del checkout: baja el
    // modal, limpia el plan y BORRA ?checkout/?billing de la URL (replace → no
    // ensucia history ni dispara el landing-skip POP). Un refresh posterior NO
    // re-abre el modal.
    const closePayment = () => {
        setIsPaymentOpen(false);
        setSelectedPlan(null);
        setSearchParams((prev) => {
            const p = new URLSearchParams(prev);
            p.delete('checkout');
            p.delete('billing');
            return p;
        }, { replace: true });
    };

    // Callback que se ejecuta cuando PayPal confirma el pago exitoso (Suscripciones)
    const handlePaymentSuccess = async (tier, subscriptionId, couponCode = null) => {
        // [P1-PAY-LIMBO · 2026-05-30] Esperar el resultado antes de cerrar el
        // modal y navegar. Si /subscription/verify falla tras un cobro PayPal
        // real, navegar incondicionalmente dejaba al usuario como gratis pero
        // suscrito (limbo). El modal queda visible durante la verificación
        // (cierra el P2 de timing) y solo navegamos en éxito; en fallo el
        // toast.error de upgradeUserPlan informa y el usuario reintenta.
        const ok = await upgradeUserPlan(tier, subscriptionId, couponCode);
        if (ok) {
            // Éxito: el cambio de ruta a /dashboard descarta los params de '/'.
            navigate('/dashboard');
        } else {
            // [PAY-MODAL-PERSIST · 2026-06-18 · FIX-B1] Fallo de verify: el usuario
            // se queda en la ruta → cerrar el modal Y limpiar los params; si no, un
            // refresh re-abriría un checkout que ya falló.
            closePayment();
        }
    };

    // [PAY-MODAL-PERSIST · 2026-06-18 · FIX-B2] Rehidratar el checkout tras un
    // refresh: si la URL trae ?checkout=<tier>, re-abre el modal con el mismo plan.
    // MOUNT-ONLY (deps []) leyendo searchParams por closure → corre 1 vez por
    // montaje (= 1 vez por refresh); cerrar el modal NUNCA lo re-dispara. NO valida
    // rank ni navega (el cobro real lo deriva el backend del plan_id de PayPal,
    // I-Billing-1); solo valida que el tier sea conocido.
    useEffect(() => {
        const t = searchParams.get('checkout');
        const b = searchParams.get('billing');
        if (!['basic', 'plus', 'ultra'].includes(t)) {
            if (t !== null || b !== null) {
                setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    p.delete('checkout');
                    p.delete('billing');
                    return p;
                }, { replace: true });
            }
            return;
        }
        // [ULTRA-MONTHLY-ONLY · 2026-06-19] Un link viejo con ?billing=annual para
        // un tier sin anual (Ultra) NO debe re-abrir un checkout anual: forzar mensual.
        const annual = b === 'annual' && !ANNUAL_DISABLED_TIERS.has(t);
        setBillingPeriod(annual ? 'annual' : 'monthly');
        setSelectedPlan({
            tier: t,
            price: PRICING[t][annual ? 'annual' : 'monthly'].price,
            name: NAME_BY_TIER[t] + (annual ? ' (Anual)' : ' (Mensual)'),
            isAnnual: annual,
        });
        setIsPaymentOpen(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Texto del botón según estado del usuario
    const getButtonText = (tier) => {
        // Ventana de carga: sesión presente pero perfil aún sin hidratar.
        if (isProfileLoading) return "Cargando…";

        // [P1-GUEST-PRICING · 2026-06-21 · P1-PRICING-ANON-LOADING 2026-07-01] Sin sesión:
        // el plan Gratis es una etiqueta de estado para el invitado ("Invitado") o un CTA
        // de conversión para el visitante anónimo ("Empezar Gratis Ahora"); los planes
        // pagos, en ambos casos, invitan a crear cuenta (el checkout requiere auth).
        if (noSession) {
            if (tier === 'gratis') return isGuest ? 'Invitado' : 'Empezar Gratis Ahora';
            return 'Crear cuenta';
        }

        // Plan Gratis: CTA de adquisición del usuario gratis sin plan (el target
        // de conversión). Antes este botón quedaba "Tu Plan Actual" + disabled
        // para el usuario gratis → CTA muerto en la tarjeta dirigida a él.
        if (tier === 'gratis') {
            if (currentTier === 'gratis') return hasStarted ? "Ir a mi Panel" : "Empezar Gratis Ahora";
            return "Incluido en tu Plan"; // ya pagó un tier superior
        }

        // Usuario autenticado
        if (currentTier === tier) {
            return "Tu Plan Actual";
        }

        const targetRank = tierRank[tier] || 1;

        if (targetRank < currentRank) {
            return "Incluido en tu Plan";
        }

        // [P2-TIER-DISPLAY-NAME · 2026-07-31] Nombre COMERCIAL, no la clave
        // interna: capitalizar `ultra` ofrecía "Cambiar a Ultra" bajo una
        // tarjeta titulada "Max" (y "Basic" bajo "Básico").
        return `Cambiar a ${DISPLAY_BY_TIER[tier] || tier}`;
    };

    // Lógica de deshabilitación de botones
    const isButtonDisabled = (tier) => {
        // Durante la carga del perfil, deshabilitar para no exponer acciones erróneas.
        if (isProfileLoading) return true;

        // [P1-GUEST-PRICING · 2026-06-21 · P1-PRICING-ANON-LOADING 2026-07-01] Sin sesión:
        // el Gratis del invitado es etiqueta de estado ('Invitado' → disabled); el Gratis
        // del anónimo es CTA de conversión ('Empezar Gratis' → clickeable); los planes
        // pagos siempre clickeables (CTA de registro) en ambos casos.
        if (noSession) return isGuest && tier === 'gratis';

        // Gratis: solo deshabilitado si el usuario YA pagó un tier superior;
        // nunca para el usuario gratis (su CTA de conversión debe ser clickeable).
        if (tier === 'gratis') return currentRank > tierRank.gratis;

        const targetRank = tierRank[tier] || 1;

        // Deshabilitar el botón si es el plan actual
        if (currentTier === tier) return true;

        // Deshabilitar SOLO si el plan visualizado es INFERIOR al actual
        return targetRank < currentRank;
    };

    const disabledStyles = { opacity: 0.85, cursor: 'not-allowed', filter: 'grayscale(100%)' };

    return (
        <section className={styles.pricing} id="pricing">

            {/* --- MODAL DE PAGO --- [P5-SPEED-PAYMENTMODAL-LAZY · 2026-06-01]
                gate por isPaymentOpen + Suspense → el chunk lazy se baja al abrir. */}
            {isPaymentOpen && (
                <Suspense fallback={null}>
                    <PaymentModal
                        isOpen={isPaymentOpen}
                        onClose={closePayment}
                        onSuccess={(subId, coupon) => handlePaymentSuccess(selectedPlan?.tier, subId, coupon)}
                        price={selectedPlan?.price || "9.99"}
                        planName={selectedPlan?.name || "Suscripción Básico"}
                        tier={selectedPlan?.tier || "basic"}
                        isAnnual={selectedPlan?.isAnnual || false}
                    />
                </Suspense>
            )}

            <div className={styles.container}>
                {/* Cabecera de la Sección */}
                <div className={styles.header}>
                    <span className={styles.badge}>Planes Flexibles</span>
                    <h2 className={styles.title}>Invierte en tu Salud</h2>
                    <p className={styles.subtitle}>
                        Comienza gratis y desbloquea todo el potencial de la IA.
                    </p>

                    {/* --- TOGGLE MENSUAL / ANUAL --- */}
                    {/* [P2-A11Y-LOGGING · 2026-05-13] role="group" + aria-label
                        en el contenedor + aria-pressed por botón para que
                        lectores de pantalla anuncien el estado seleccionado.
                        Sin esto, ambos botones se anuncian igual (visual
                        active vía className es invisible a la AT). */}
                    <div className={styles.billingToggle} role="group" aria-label="Periodo de facturación">
                        <button
                            className={`${styles.toggleOption} ${!isAnnual ? styles.toggleActive : ''}`}
                            onClick={() => setBillingPeriod('monthly')}
                            aria-pressed={!isAnnual}
                        >
                            Mensual
                        </button>
                        <button
                            className={`${styles.toggleOption} ${isAnnual ? styles.toggleActive : ''}`}
                            onClick={() => setBillingPeriod('annual')}
                            aria-pressed={isAnnual}
                        >
                            Anual
                            <span className={styles.discountBadge}>-25%</span>
                        </button>
                    </div>
                </div>

                <div className={styles.grid}>
                    {TIER_ROWS.map(({ key, popular, blurb, extras }) => {
                        const isFree = key === 'gratis';
                        const delta = quotaDelta(key);
                        return (
                            <div
                                key={key}
                                className={`${styles.card} ${popular ? styles.popular : ''}`}
                            >
                                {popular && <div className={styles.popularBadge}>Más Popular</div>}
                                <div className={styles.cardContent}>
                                    <h3 className={styles.planName}>{DISPLAY_BY_TIER[key]}</h3>

                                    {/* LO QUE PAGAS */}
                                    <div className={styles.price}>
                                        <span className={styles.currency}>USD$</span>
                                        <span className={styles.amount}>{getPrice(key)}</span>
                                        {!isFree && (
                                            <span className={styles.period}>{getPeriodLabel(key)}</span>
                                        )}
                                    </div>
                                    <p className={styles.priceNote}>{priceNote(key)}</p>

                                    {/* ── la regla vive aquí: separa lo que pagas de lo que
                                        recibes. Es el único corte de la celda y cae a la misma
                                        altura en las cuatro porque todo lo de arriba mide
                                        exactamente una línea. ── */}

                                    {/* LO QUE RECIBES — misma gramática que la fila de precio
                                        (cifra + unidad en mono), porque son las dos lecturas
                                        del mismo instrumento. */}
                                    <div className={styles.quota}>
                                        <span className={styles.quotaFigure}>{quotaOf(key)}</span>
                                        <span className={styles.quotaUnit}>créditos/mes</span>
                                    </div>
                                    <p className={styles.quotaDelta}>{delta}</p>

                                    <p className={styles.description}>{blurb}</p>

                                    {extras.length > 0 && (
                                        <ul className={styles.extras}>
                                            {extras.map((e) => (
                                                <li key={e}>
                                                    <Check size={16} className={styles.check} /> {e}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    <button
                                        className={popular ? styles.btnPrimary : styles.btnOutline}
                                        onClick={
                                            isFree
                                                ? handleFreePlanClick
                                                : () => handleUpgradeClick(key, NAME_BY_TIER[key])
                                        }
                                        disabled={isButtonDisabled(key)}
                                        style={isButtonDisabled(key) ? disabledStyles : {}}
                                    >
                                        {getButtonText(key)}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── ZÓCALO: lo que traen las cuatro ──────────────────────────
                    Va FUERA de `.grid` y a todo el ancho a propósito. Dentro de
                    una columna esto era una lista de nueve marcas que hacía
                    parecer al plan gratis el más generoso de los cuatro; aquí es
                    la afirmación que sostiene la página entera. */}
                <div className={styles.shared}>
                    {/* `h3`, no `p`: es hermano de los cuatro `h3` de nombre de plan
                        y cuelga del mismo `h2` de sección. Como `p` desaparecía del
                        esquema de encabezados, y quien navega por saltos de título
                        —que en esta página es exactamente quien no puede recorrer
                        una tabla de un vistazo— se perdía el bloque que dice que
                        las funciones no dependen del plan. */}
                    <h3 className={styles.sharedLabel}>Incluido en los cuatro planes</h3>
                    <ul className={styles.sharedList}>
                        {SHARED_FEATURES.map((f) => (
                            <li key={f}>
                                <Check size={16} className={styles.check} /> {f}
                            </li>
                        ))}
                    </ul>
                    {/* Redacción vigilada: la primera versión decía «ningún plan
                        recorta funciones», y a dos columnas de distancia Max vende
                        «acceso anticipado a nuevas funciones». Las dos frases no se
                        contradicen del todo —nada se recorta, solo llega más tarde—
                        pero obligan al lector a reconciliarlas. Nombrar la única
                        excepción cuesta media línea y cierra la duda. */}
                    <p className={styles.sharedNote}>
                        Ninguna función está reservada a los planes pagos. Lo que cambia entre columnas es cuántos créditos tienes al mes — y, en Max, cuándo te llegan las funciones nuevas.
                    </p>
                </div>

            </div>
        </section>
    );
};

export default Pricing;