/**
 * [P1-QCOUNTRY-BEFORE-BUDGET · 2026-08-21] El wizard preguntaba el país DIEZ pasos después del
 * presupuesto, y eso dejaba muerta toda la maquinaria multi-moneda de Fase 1 T6.
 *
 * `QBudget` resuelve las monedas que ofrece con `currencyOptionsForCountry(formData.country, …)`.
 * Cuando el usuario llega a ese paso, `formData.country` todavía es el `'DO'` que siembra
 * `initialFormData` — nunca lo eligió, porque el paso de país iba diez posiciones más adelante.
 * Consecuencias, todas medidas:
 *
 *   · el toggle ofrece EXACTAMENTE [RD$, US$]: la opción EUR/MXN/COP que T6 construyó es
 *     inalcanzable en el camino de alta primario;
 *   · el hint dice «Mínimo RD$13,000 para 30 días» y el gate no deja avanzar hasta teclearlo;
 *   · el prefijo del input es «RD$» y el piso exigido es el DOP.
 *
 * Confirmado en la base de datos viva: las 8 filas de `user_profiles` tienen
 * `budgetCurrency='DOP'` o NULL. **Cero usuarios con moneda beta**, incluida la cuenta que generó
 * los dos planes beta. Y de ahí sale el «RD$» que la auditoría creyó ver en el prompt: el prompt
 * renderiza fielmente la moneda que le dan, y la moneda que le dan es DOP.
 *
 * LA PRESELECCIÓN POR ZONA HORARIA NO LO ARREGLA: corre al MONTAR `QCountry`, o sea ocho pasos
 * después de que el daño esté hecho.
 *
 * EL CUIDADO QUE ESTE FIX NO PUEDE OLVIDAR. Mover el paso corre los índices de
 * `mealfit_wizard_step`, que se persisten en localStorage — la propia doc de Fase 0 avisa de que
 * ese corrimiento «ocurre UNA vez, en el deploy del flip». Este es el segundo. Por eso el fix NO
 * siembra el país por zona horaria en `initialFormData`: un default sembrado es indistinguible de
 * una elección, que es exactamente lo que costó el incidente P1-COUNTRY-RENEWAL-PROFILE-WINS. El
 * país se sigue eligiendo en su paso; lo único que cambia es CUÁNDO se pregunta.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FLOW = resolve(__dirname, '../components/assessment/InteractiveAssessmentFlow.jsx');
const src = readFileSync(FLOW, 'utf8');

/** Posición del paso que declara `fields: ['<campo>']` dentro del array de pasos. */
function posDelPaso(campo) {
    const i = src.indexOf(`fields: ['${campo}']`);
    expect(i, `no encontré el paso de '${campo}'`).toBeGreaterThan(-1);
    return i;
}

describe('el país se pregunta antes que el dinero', () => {
    it('QCountry va ANTES que QBudget', () => {
        // RED pre-fix: el país estaba ~10 pasos después, así que el toggle de moneda no podía
        // ofrecer la del usuario y el piso exigido era el dominicano.
        expect(posDelPaso('country')).toBeLessThan(posDelPaso('budget'));
    });

    it('QCountry va también antes del tamaño del hogar y la duración', () => {
        // `groceryDuration` escala el piso de presupuesto (7/15/30 días) y `householdSize` lo
        // multiplica: los dos alimentan el mismo cálculo en la moneda del país. Preguntar el país
        // después de ellos deja el mismo hueco un paso más allá.
        expect(posDelPaso('country')).toBeLessThan(posDelPaso('groceryDuration'));
    });

    it('QCountry sigue estando DESPUÉS de los datos que abren el formulario', () => {
        // El país no se sube al principio del todo: el arranque del wizard son los datos
        // corporales, que es lo que engancha al usuario. Este control impide que un futuro
        // reordenamiento lo empuje al paso 1 «porque es importante».
        expect(posDelPaso('country')).toBeGreaterThan(posDelPaso('gender'));
    });
});

describe('lo que el fix NO debe hacer', () => {
    it('no siembra el país por zona horaria en initialFormData', () => {
        // Un default sembrado es indistinguible de una elección — la lección exacta que costó
        // P1-COUNTRY-RENEWAL-PROFILE-WINS, donde el 'DO' que nadie eligió pisó el 'ES' del perfil
        // en una renovación. La preselección por IANA vive en QCountry y ahí se queda.
        const ctx = readFileSync(resolve(__dirname, '../context/AssessmentContext.jsx'), 'utf8');
        expect(ctx).not.toContain('countryFromTimeZone');
    });

    it('el paso de país sigue gateado por la bandera del build', () => {
        // Con `VITE_COUNTRY_SYSTEM` ausente el paso no se monta y el wizard es el de siempre.
        const i = posDelPaso('country');
        const antes = src.slice(Math.max(0, i - 400), i);
        expect(antes).toContain('COUNTRY_SYSTEM_UI');
    });

    it('el submit sigue viviendo en el último paso, no en el de país', () => {
        // La razón original por la que el país estaba al final: el último paso lleva el submit
        // (`QSupplements`/`QPantryBuilder` con `onFinish`), y un paso después del submit no se
        // pregunta nunca. Mover el país hacia ARRIBA no toca esa propiedad, pero conviene anclarla.
        expect(src).toMatch(/onFinish=\{[^}]*submitAndGenerate/);
    });
});
