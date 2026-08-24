// [P2-NEVERA-UNIT-SYSTEM-POR-PAIS · 2026-08-23] Sistema de unidades por país, para PINTAR.
//
// EL DEFECTO QUE CIERRA. `P1-UNIT-SYSTEM-BY-COUNTRY` proyectó la lista de la compra a
// unidades métricas (`_project_display_units_for_country`, shopping_calculator.py) y la
// proyección se detuvo AHÍ. La Nevera nace de esa misma lista vía `/restock`, pero pinta
// `quantity` + `market_container || unit` crudos, y `market_container` es NULL en las 141
// filas de catálogo-país: un ítem real de una corrida de España
// (`market_qty_numeric: 4.5, market_unit: "lbs", display_qty: "2 kg"`) se leía «2 kg» en la
// lista y «4,5 lbs» en la Nevera, en la misma sesión y sobre el mismo alimento.
//
// EL DATO NO SE TOCA, Y ESO ES UNA DECISIÓN ANCLADA POR TEST, no una omisión: el backend
// deduce el inventario en libras (`test_p1_unit_system_by_country.py`,
// `test_los_campos_que_consume_la_nevera_quedan_intactos`). Convertir el dato metería gramos
// donde la deducción espera libras. Aquí se proyecta el DISPLAY y nada más.
//
// POR QUÉ EXISTE ESTE FICHERO Y NO OTRA CONSTANTE MÁS. Las unidades del selector estaban
// escritas DOS veces —`UNIT_OPTIONS` en QPantryBuilder y `COMMON_PURCHASE_UNITS` en
// Pantry— y ya habían drifteado ('lb' vs 'libra', 'funda' vs 'bolsa', una con 'g' sin 'kg'
// y la otra al revés). Es la clase de fallo que `P1-DIET-CANON-SSOT` pagó con tres tablas
// de dieta; escribir una tercera para arreglarlo habría sido el mismo error con más pasos.
import { coerceCountry, COUNTRY_SYSTEM_UI } from './countries';

// Espejo de `unit_system` dentro de `COUNTRY_PROFILES` (backend/constants.py). La paridad la
// vigila `backend/tests/test_p2_nevera_unit_system_por_pais.py`: si añades un país allá y no
// aquí (o al revés), CI rojo — el mismo contrato que ya tienen COUNTRIES ↔ COUNTRY_PROFILES.
//
// DO/US/PR en 'imperial' no es un olvido: en los tres la libra es la unidad real con la que
// se compra la carne, así que convertirla sería el mismo defecto al revés.
export const UNIT_SYSTEM_BY_COUNTRY = {
    DO: 'imperial',
    ES: 'metric',
    US: 'imperial',
    MX: 'metric',
    PR: 'imperial',
    CO: 'metric',
};

export const DEFAULT_UNIT_SYSTEM = 'imperial';

/**
 * 'imperial' | 'metric'. Lo desconocido cae a 'imperial' — la conducta de hoy, y el mismo
 * fail-safe que el SSOT del backend.
 *
 * `countrySystemUI` es el 2.º parámetro, OPCIONAL, default la bandera real del build. Con el
 * sistema de países APAGADO todo el mundo es imperial: es exactamente el mundo pre-flip, así
 * que apagar `VITE_COUNTRY_SYSTEM` sigue siendo el rollback de una sola palanca. El parámetro
 * existe además para que los tests fijen la bandera sin mockear el módulo — mismo patrón que
 * `effectiveBudgetCurrency`.
 */
export function unitSystemForCountry(raw, countrySystemUI = COUNTRY_SYSTEM_UI) {
    if (!countrySystemUI) return DEFAULT_UNIT_SYSTEM;
    return UNIT_SYSTEM_BY_COUNTRY[coerceCountry(raw)] || DEFAULT_UNIT_SYSTEM;
}

// Envases: son la MISMA lista en los dos sistemas — una lata es una lata en Madrid y en
// Santiago. Lo que cambia con el país es la MEDIDA, no el envase.
const ENVASES = ['paquete', 'funda', 'lata', 'botella', 'cartón', 'caja', 'bolsa', 'sobre', 'galón', 'taza'];

// La proyección es de ORDEN, no una amputación: las dos listas contienen las mismas medidas y
// sólo cambia cuál se alcanza primero. Quitarle 'libra' a un español le rompería la fila del
// alimento que YA tiene guardado en libras, que es justo el caso que este fichero existe para
// atender.
const MEDIDAS_POR_SISTEMA = {
    imperial: ['libra', 'oz', 'g', 'kg', 'ml'],
    metric: ['kg', 'g', 'ml', 'libra', 'oz'],
};

/**
 * Las unidades que ofrece un selector de la Nevera, ordenadas por el sistema del país.
 * `unidad` va SIEMPRE primero: es el default de toda fila sin envase curado.
 */
export function unitOptionsForCountry(country, countrySystemUI = COUNTRY_SYSTEM_UI) {
    const sistema = unitSystemForCountry(country, countrySystemUI);
    return ['unidad', ...MEDIDAS_POR_SISTEMA[sistema], ...ENVASES];
}

const G_POR_LB = 453.592;
const G_POR_OZ = 28.3495;
// Unidades de mercado que son una ORDEN DE PESAR, no el rótulo de un envase. Espejo de
// `_UNIDADES_DE_PESO_IMPERIAL` (shopping_calculator.py).
const PESO_IMPERIAL = new Set(['lb', 'lbs', 'libra', 'libras', 'oz', 'onza', 'onzas']);

/**
 * Proyecta un par (cantidad, unidad) a métrico PARA PINTAR. Devuelve
 * `{ qty, unit, converted }` — con `converted:false` y los valores de entrada intactos
 * siempre que no toque convertir.
 *
 * NO devuelve una cadena ya formateada a propósito: el separador decimal lo pone
 * `formatNumber` con el idioma activo. La versión del backend clava la coma y por eso
 * escribe «1,4 kg» también para un usuario en inglés (`P3-I18N-METRICA-COMA-CLAVADA`
 * documenta que ni siquiera acierta en es-DO, donde `Intl` da punto).
 *
 * Umbral y redondeo son los de `_etiqueta_metrica`: ≥1000 g ⇒ kg con un decimal; si no,
 * gramos enteros. Que las dos superficies redondeen igual es el punto — leer «2 kg» en la
 * lista y «2,04 kg» en la Nevera sería el mismo defecto con otra cara.
 */
export function projectMeasureForCountry(qty, unit, country, countrySystemUI = COUNTRY_SYSTEM_UI) {
    const sinTocar = { qty, unit, converted: false };
    if (unitSystemForCountry(country, countrySystemUI) !== 'metric') return sinTocar;
    const u = String(unit ?? '').trim().toLowerCase().replace(/\.$/, '');
    if (!PESO_IMPERIAL.has(u)) return sinTocar;
    const n = Number(qty);
    // `n <= 0` no se convierte: 0 g y 0 lb dicen lo mismo, y un negativo es dato corrupto que
    // no mejora por cambiarle la unidad.
    if (!Number.isFinite(n) || n <= 0) return sinTocar;
    const gramos = n * (u.startsWith('oz') || u.startsWith('onza') ? G_POR_OZ : G_POR_LB);
    if (gramos >= 1000) return { qty: Math.round(gramos / 100) / 10, unit: 'kg', converted: true };
    return { qty: Math.round(gramos), unit: 'g', converted: true };
}
