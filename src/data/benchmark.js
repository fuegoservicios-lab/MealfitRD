// [P1-PAPER-BENCHMARK · 2026-08-02] SSOT de las cifras del benchmark A/B.
//
// POR QUÉ EXISTE. Estas mismas cifras vivían escritas A MANO en TRES ficheros
// (`components/home/BenchmarkShowcase.jsx`, `pages/PrecisionPage.jsx`,
// `pages/Engine.jsx`) y ya habían drifteado: la fila «macros que cuadran al
// recalcular» decía `llm: 0` en dos y `llm: 55` en la tercera. Nadie podía
// saber cuál era la buena leyendo el código — la sección quedó bloqueada
// esperando al dueño.
//
// LA DECISIÓN. El dueño fijó el valor el 2026-08-02: es **0**. `PrecisionPage`
// era el que mentía. Y como 0-contra-100 es una CAPACIDAD BINARIA y no una
// magnitud, esa fila no vive en `VERSUS` (donde se dibujaba en un eje 0-100 y
// fabricaba un «Δ 100 pts» que no significa nada): vive en `CAPS`, como
// `■ SÍ / □ NO`. Ver §5.1 del spec.
//
// REGLA DE MANTENIMIENTO. Si añades una cifra, añádela AQUÍ. Lo que se puede
// DERIVAR no se escribe: la Δ de la Fig. 04.2, el error del peor macro y el
// error «sin motor» de proteína se calculan de estos valores. Escribir un
// derivado abre un sitio de drift nuevo, que es exactamente el bug que este
// fichero cierra. `backend/tests/test_p1_paper_benchmark_ssot.py` falla si un
// consumidor vuelve a declarar cifras propias o si la Δ aparece escrita.
//
// LO QUE NO VIVE AQUÍ: las ETIQUETAS de las cifras de titular. Difieren a
// propósito entre superficies (el landing decía «error medio en el peor
// macro», /precision dice «Error medio · peor macro»); eso es copy de cada
// página, no drift. Ver `HEADLINE_FIGURES` abajo.
//
// Tooltip-anchor: P1-PAPER-BENCHMARK

/* La serie medida. NO es una medición en vivo — el badge «MEDICIÓN EN VIVO»
   que decía lo contrario se retiró por decisión del dueño (spec §10.1): son 8
   planes dominicanos generados en junio de 2026 con el motor
   `P3-MACRO-REBALANCE`.

   `month` es la forma de cartucho (mono, versalitas) y `monthLong` la de
   prosa: la misma fecha en dos registros tipográficos, declarada una vez.
   Derivar una de la otra obligaría a un mapa de meses en español por tres
   caracteres. */
export const SERIES = { n: 8, month: 'JUN 2026', monthLong: 'junio de 2026' };

/* Error absoluto porcentual medio (MAPE) por macronutriente, CON el motor
   encendido. Es un error, no un acierto: `98,5 % de precisión` era
   `100 − MAPE` disfrazado de porcentaje de acierto. */
export const MACROS = [
    { key: 'protein', label: 'Proteína', mape: 1.5 },
    { key: 'kcal', label: 'Calorías', mape: 2.0 },
    { key: 'fat', label: 'Grasas', mape: 3.1 },
    { key: 'carbs', label: 'Carbohidratos', mape: 3.2 },
];

/* Banda de tolerancia DECLARADA, en % de desviación respecto al objetivo.
   NO es constante entre macros porque la especificación no lo es: «en banda»
   significa 90-112 % del objetivo en los tres macros y 95-105 % en calorías.
   La banda es la ESPECIFICACIÓN; el tick es el DATO. Hacer variar el ancho de
   la banda para codificar el dato destruiría la comparabilidad entre filas. */
export const BANDS = { macros: [-10, 12], kcal: [-5, 5] };

/* Las DOS métricas que sí son magnitudes comparables dentro de su fila
   (Bioboros contra el mismo pipeline con el motor apagado).
   `macroKey` es la JUNTA con `MACROS`, no copy: la Fig. 04.1 le cuelga a esa
   fila el segundo marcador (el «sin motor»). Se une por clave y no por la
   etiqueta visible a propósito — renombrar «Proteína» no puede desconectar en
   silencio la única comparación medida de la figura. */
export const VERSUS = [
    {
        key: 'protein',
        macroKey: 'protein',
        label: 'Precisión de proteína',
        axis: 'Proteína',
        mealfit: 98.5,
        llm: 84,
    },
    {
        key: 'inBand',
        label: 'Los 4 macros en banda',
        axis: '4 macros',
        mealfit: 91.7,
        llm: 24,
    },
];

/* Capacidades: tres estados por FORMA pura (■ sí / ▨ parcial / □ no), nunca
   por color. `yes` | `partial` | `no`.
   La cuarta fila BAJÓ del gráfico (ver la cabecera de este fichero): era
   `mealfit: 100, llm: 0`, y 100-contra-0 en el mismo eje que un porcentaje
   fabricaba una diferencia inventada. Aquí dice lo mismo sin inflarlo. */
export const CAPS = [
    {
        key: 'clinical',
        label: 'Se ajusta a tus condiciones',
        sub: 'DM2 · renal · HTA · alergias',
        mealfit: 'yes',
        llm: 'partial',
    },
    {
        key: 'shopping',
        label: 'Lista de compras + Nevera',
        sub: 'automática, sin que la armes tú',
        mealfit: 'yes',
        llm: 'no',
    },
    {
        key: 'coach',
        label: 'Coach que ajusta tu plan',
        sub: 'cambia comidas, registra, responde',
        mealfit: 'yes',
        llm: 'partial',
    },
    {
        key: 'recalc',
        label: 'Macros que cuadran al recalcular',
        sub: 'calculados de los ingredientes, no estimados a ojo',
        mealfit: 'yes',
        llm: 'no',
    },
];

/* Cifras de titular. Solo NÚMEROS: las etiquetas son copy de cada superficie.
   `worstMacroError` se DERIVA de `MACROS` — escribir `3.2` aquí habría creado
   un sitio de drift dentro del propio SSOT. */
export const HEADLINE_FIGURES = {
    deterministic: 100,
    worstMacroError: Math.max(...MACROS.map((m) => m.mape)),
};

/* Formato es-DO con un decimal: la coma es el separador decimal del locale, y
   el producto no tiene i18n (P3-I18N-DEFERRED) — se formatea a mano, una vez,
   aquí, en vez de escribir «1,5» a mano en cada superficie. */
export const es1 = (n) => n.toFixed(1).replace('.', ',');

/* [P1-LANDING-CLINICAL-FACTS · 2026-08-08] La matriz CLÍNICA medida contra producción.
   Corrida N=20 del 2026-08-08 (GitHub Actions run 31264465719, modo remote guest —
   el runner llama al API de producción real, sin claves ni mocks): los 20 perfiles del
   wizard con restricciones difíciles (6 alergias, 3 dietas, bariátrica, DM2, HTA,
   warfarina, embarazo), generación completa + swaps, tras los 3 P-fixes del 2026-08-08
   (P1-DIET-BLIND-DIRECTIVES / P1-DIET-BLIND-CLOSERS / P1-REVIEWER-VERIFICATION-ADVISORY).

   TRANSPARENCIA (decisión del dueño 2026-08-08): el 65 % de entrega se publica tal
   cual, con su denominador y su lectura honesta — los 7 perfiles restantes NO reciben
   un plan inseguro: el sistema los RECHAZA y lo dice. Ese trade es el producto.
   Cifras nuevas se refrescan re-corriendo la matriz, nunca editando a mano. */
export const CLINICAL = {
    n: 20,                 // perfiles de la matriz (chips reales del wizard)
    runsCount: 2,          // corridas N=20 completas post-fixes 2026-08-08/09
    samples: 40,           // n × runsCount — el denominador REAL de la tasa de entrega
    delivered: 24,         // 13/20 (run 31264465719) + 11/20 (run 31290118080)
    month: 'AGO 2026',
    monthLong: 'agosto de 2026',
    runIds: ['31264465719', '31290118080'],
    /* [P1-CLINICAL-POOLED · 2026-08-09] La tasa se publica POOLED sobre las corridas completas
       comparables, no sobre la mejor: las dos corridas dieron 13/20 y 11/20 con perfiles
       caídos DISTINTOS (una muestra por perfil ⇒ varianza ±10pp por corrida). Publicar una
       sola habría sido cherry-picking; el pool con su denominador es el número defendible.
       Al añadir una corrida nueva: sumar a delivered/samples y citar el run — jamás sustituir
       por la mejor. */
    safetyPct: 100,        // planes entregados sin UNA sola violación — en AMBAS corridas
    minMealsPct: 100,      // ≥5 comidas en insulina/bariátrica, verificado donde aplica
    vitKMonitorPct: 100,   // monitor de vitamina K presente con warfarina
    qualityIndex: 90.1,    // media ponderada del índice interno (13×91,9 + 11×87,9)/24
};
export const CLINICAL_DELIVERY_PCT = Math.round((CLINICAL.delivered / CLINICAL.samples) * 100);
