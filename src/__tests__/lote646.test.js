// [P1-PLAN-LOTE-646 · 2026-09-27] (T15) El rechazo de la verificación del pago, en el idioma del usuario.
//
// `upgradeUserPlan` hacía `throw new Error(errData.detail || t('…'))`: el `detail` del servidor es español y, al
// existir, ganaba siempre al copy traducido. Ahora pasa por `mensajeDelServidor` con las frases fijas del endpoint.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mensajeDelServidor } from '../utils/errorCopy';

const src = readFileSync(resolve(__dirname, '../context/AssessmentContext.jsx'), 'utf8');
const t = (s) => `EN(${s})`;

describe('[646] el error de la verificación del pago', () => {
    it('ya no deja ganar al detail español', () => {
        expect(src).not.toMatch(/errData\.detail \|\| t\('Fallo en la verificación del pago en el servidor\.'\)/);
        expect(src).toMatch(/mensajeDelServidor\(errData\.detail, MENSAJES_VERIFICAR_PAGO,/);
    });

    it('una frase fija del endpoint se traduce; una desconocida cae al copy traducido', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const conocidas = ['La suscripción no fue reconocida por PayPal.'];
        expect(mensajeDelServidor('La suscripción no fue reconocida por PayPal.', conocidas, 'FB', t, 'en-US'))
            .toBe('EN(La suscripción no fue reconocida por PayPal.)');
        expect(mensajeDelServidor('Suscripción no válida. Estado actual: SUSPENDED', conocidas, 'FB', t, 'en-US')).toBe('FB');
        // en español se enseña tal cual (trae el motivo concreto)
        expect(mensajeDelServidor('Suscripción no válida. Estado actual: SUSPENDED', conocidas, 'FB', t, 'es-DO'))
            .toBe('Suscripción no válida. Estado actual: SUSPENDED');
    });
});
