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
// Nadie fue cobrado: cero suscripciones activas cuando se detectó. Los tres
// quedaron INACTIVE en PayPal, y este set impide que la UI los siga ofreciendo
// (un plan apagado acepta clics pero rechaza la suscripción).
//
// Este test es un GUARD DE DINERO, no de estilo: si alguien vacía el set sin
// haber recreado los planes con `interval_unit: YEAR`, la app vuelve a vender
// un cobro nueve veces mayor que el anunciado.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ANNUAL_DISABLED_TIERS } from '../config/plans.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..');

describe('P0-ANNUAL-PLANS-MISCONFIGURED · el anual no se ofrece', () => {
    it.each(['basic', 'plus', 'ultra'])(
        'el tier «%s» NO ofrece plan anual mientras los de PayPal sigan mal',
        (tier) => {
            expect(ANNUAL_DISABLED_TIERS.has(tier)).toBe(true);
        }
    );

    it('reactivar el anual exige tocar ESTE fichero, que lleva el porqué al lado', () => {
        // Si alguien quita un tier del set, se topa antes con el comentario que
        // explica que los planes de PayPal hay que RECREARLOS (ni el nombre ni
        // la frecuencia son editables). Sin esa fricción, "habilitar el anual"
        // parece un cambio de una línea y vuelve a vender el cobro mensual.
        const src = readFileSync(join(SRC, 'config', 'plans.js'), 'utf-8');
        expect(src).toContain('interval_unit');
        expect(src).toMatch(/89\.99/);
        expect(src).toMatch(/CREARLOS DE NUEVO|crear los 3 planes/i);
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
        // y aquí eso significa seguir vendiendo el plan roto desde una de las
        // dos pantallas.
        const files = walk(SRC);
        expect(files.length).toBeGreaterThan(100); // sanity del vehículo

        const local = files.filter((f) =>
            /const\s+ANNUAL_DISABLED_TIERS\s*=/.test(readFileSync(f, 'utf-8'))
        ).map((f) => f.replace(SRC, 'src'));

        // Solo la SSOT puede declararla.
        expect(local).toEqual([join('src', 'config', 'plans.js')]);
    });
});
