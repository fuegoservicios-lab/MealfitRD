// [P0-ANNUAL-PLANS-MISCONFIGURED · 2026-07-30] Los tres planes "Anual" de
// PayPal estaban creados con `interval_unit: MONTH` en vez de `YEAR`: cobraban
// el precio ANUAL todos los MESES.
//
//     Básico Anual  89.99 USD cada 1 MONTH  ->  ~1.080 USD/año en vez de 89.99
//
// La aritmética delata la intención: el mensual son 9.99 y
// 9.99 × 12 × 0.75 = 89.91 ≈ 89.99, exactamente el "25% de descuento" que
// promete la descripción del plan. Nueve veces de más.
//
// Nadie fue cobrado: cero suscripciones activas cuando se detectó. Se
// recrearon Básico Anual y Plus Anual con `interval_unit: YEAR`; Max se quedó
// sin anual.
//
// EL GUARD QUE IMPORTA es el de abajo: `ANNUAL_DISABLED_TIERS` y las env vars
// `VITE_PAYPAL_PLAN_<TIER>_ANNUAL` son DOS MITADES DEL MISMO INTERRUPTOR, y
// hasta ahora nada las obligaba a coincidir. Cada mitad falla distinto:
//
//   - Ofrecer un tier sin env var  -> `plan_id: undefined` a PayPal.
//   - Env var de un tier no ofrecido -> id muerto esperando a que alguien
//     "reactive el anual" quitándolo del set sin mirar a qué apunta. Así nació
//     este P-fix: el id que quedaba era el del plan que cobraba 9 veces.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ANNUAL_DISABLED_TIERS } from '../config/plans.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..');
const FRONTEND = join(SRC, '..');
const TIERS = ['basic', 'plus', 'ultra'];

/** Env vars activas de `.env.production` (ignora comentarios y vacíos). */
function envProduction() {
    const raw = readFileSync(join(FRONTEND, '.env.production'), 'utf-8');
    const out = {};
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i < 1) continue;
        const value = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        if (value) out[t.slice(0, i).trim()] = value;
    }
    return out;
}

describe('P0-ANNUAL-PLANS-MISCONFIGURED · qué tiers ofrecen anual', () => {
    it('Básico y Plus SÍ ofrecen anual (sus planes se recrearon con YEAR)', () => {
        expect(ANNUAL_DISABLED_TIERS.has('basic')).toBe(false);
        expect(ANNUAL_DISABLED_TIERS.has('plus')).toBe(false);
    });

    it('Max NO ofrece anual: ese plan nunca se recreó en PayPal', () => {
        expect(ANNUAL_DISABLED_TIERS.has('ultra')).toBe(true);
    });

    it('el fichero lleva al lado el porqué, con el precio correcto de Max', () => {
        // Quien venga a "encender el anual de Max" se topa antes con la
        // instrucción de crear el plan en PayPal primero. Sin esa fricción
        // parece un cambio de una línea.
        const src = readFileSync(join(SRC, 'config', 'plans.js'), 'utf-8');
        expect(src).toContain('interval_unit');
        expect(src).toMatch(/449\.91/); // 49.99 × 12 × 0.75
    });
});

describe('P0-ANNUAL-PLANS-MISCONFIGURED · el set y las env vars concuerdan', () => {
    // Sanity del vehículo ANTES de afirmar nada: si el fichero no se lee o el
    // frontend deja de usar estos nombres, los asserts de abajo pasarían en
    // vacío y este bloque dejaría de proteger sin ponerse rojo.
    it('`.env.production` se lee y tiene los 3 planes mensuales', () => {
        const env = envProduction();
        expect(Object.keys(env).length).toBeGreaterThan(10);
        for (const tier of TIERS) {
            expect(env[`VITE_PAYPAL_PLAN_${tier.toUpperCase()}`]).toMatch(/^P-/);
        }
    });

    it('PaymentModal sigue leyendo `VITE_PAYPAL_PLAN_<TIER>_ANNUAL`', () => {
        // Ancla al código que TOMA LA DECISIÓN. Si alguien renombra la env var,
        // este test falla aquí en vez de seguir comparando contra un nombre
        // que ya no existe.
        const modal = readFileSync(
            join(SRC, 'components', 'dashboard', 'PaymentModal.jsx'), 'utf-8');
        for (const tier of TIERS) {
            expect(modal).toContain(
                `import.meta.env.VITE_PAYPAL_PLAN_${tier.toUpperCase()}_ANNUAL`);
        }
    });

    it.each(TIERS)('«%s»: ofrecerlo ⟺ tener su plan id anual configurado', (tier) => {
        const env = envProduction();
        const id = env[`VITE_PAYPAL_PLAN_${tier.toUpperCase()}_ANNUAL`];
        const seOfrece = !ANNUAL_DISABLED_TIERS.has(tier);

        if (seOfrece) {
            // Sin esto, PaymentModal manda `plan_id: undefined` a PayPal.
            expect(id, `«${tier}» ofrece anual pero no tiene ` +
                `VITE_PAYPAL_PLAN_${tier.toUpperCase()}_ANNUAL en .env.production`
            ).toMatch(/^P-/);
        } else {
            // Un id activo de un tier no ofrecido es munición cargada: invita a
            // quitar el tier del set dando por hecho que el id de al lado es
            // bueno. El de Max apuntaba al plan que cobraba 9 veces de más.
            expect(id, `«${tier}» no ofrece anual pero deja un plan id activo ` +
                `(${id}). Coméntalo o recrea el plan y quita el tier del set.`
            ).toBeUndefined();
        }
    });
});

describe('P0-ANNUAL-PLANS-MISCONFIGURED · una sola definición', () => {
    function walk(dir, acc = []) {
        for (const name of readdirSync(dir)) {
            if (name === 'node_modules' || name === '__tests__') continue;
            const full = join(dir, name);
            if (statSync(full).isDirectory()) walk(full, acc);
            else if (/\.(js|jsx)$/.test(name)) acc.push(full);
        }
        return acc;
    }

    it('nadie redefine ANNUAL_DISABLED_TIERS en local', () => {
        // Estaba duplicado en `Pricing.jsx` y `Upgrade.jsx`. Dos copias del
        // mismo interruptor garantizan que un día se apague uno y no el otro —
        // y aquí eso significa vender un plan que no se puede cobrar.
        const files = walk(SRC);
        expect(files.length).toBeGreaterThan(100); // sanity del vehículo

        const local = files.filter((f) =>
            /const\s+ANNUAL_DISABLED_TIERS\s*=/.test(readFileSync(f, 'utf-8'))
        ).map((f) => f.replace(SRC, 'src'));

        // Solo la SSOT puede declararla.
        expect(local).toEqual([join('src', 'config', 'plans.js')]);
    });
});
