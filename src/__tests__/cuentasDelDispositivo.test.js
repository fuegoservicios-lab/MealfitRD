// [P1-PLAN-LOTE-97 · 2026-09-18] Qué cuentas han entrado en este dispositivo, y cuándo preguntar «¿Es la cuenta que
// querías?» tras un acceso con Google. Google no pregunta qué cuenta usar (lote 96) y en el iPhone del dueño creó una
// cuenta nueva y vacía con su otro correo.
import { describe, it, expect, beforeEach } from 'vitest';
import {
    enmascararCorreo, leerCuentas, recordarCuenta, marcarInicioGoogle, evaluarAccesoGoogle,
} from '../utils/cuentasDelDispositivo';

const AHORA = Date.parse('2026-09-18T12:00:00Z');
const HABITUAL = { id: 'u-habitual', email: 'angelo@gmail.com', created_at: '2026-09-16T12:23:16Z' };
const OTRA_VIEJA = { id: 'u-otra', email: 'otro.correo@gmail.com', created_at: '2026-08-01T10:00:00Z' };
const NUEVA = { id: 'u-nueva', email: 'nuevo@gmail.com', created_at: '2026-09-18T11:58:00Z' };

describe('cuentas del dispositivo', () => {
    beforeEach(() => localStorage.clear());

    it('enmascara el correo: nunca se guarda completo', () => {
        expect(enmascararCorreo('angelo@gmail.com')).toBe('an***@gmail.com');
        expect(enmascararCorreo('a@x.com')).toBe('a***@x.com');
        expect(enmascararCorreo('sin-arroba')).toBeNull();
        expect(enmascararCorreo('')).toBeNull();
    });

    it('recuerda como mucho 5 cuentas, la más reciente primero, sin correos completos', () => {
        for (let i = 0; i < 7; i += 1) recordarCuenta({ id: `u${i}`, email: `persona${i}@x.com` }, AHORA + i);
        const lista = leerCuentas();
        expect(lista).toHaveLength(5);
        expect(lista[0].id).toBe('u6');
        expect(JSON.stringify(lista)).not.toContain('persona6@x.com');
    });

    it('sin acceso con Google reciente: recuerda y no pregunta (un login con correo es deliberado)', () => {
        recordarCuenta(HABITUAL, AHORA - 1000);
        expect(evaluarAccesoGoogle(OTRA_VIEJA, AHORA)).toEqual({ mostrar: false });
        expect(leerCuentas().map((x) => x.id)).toContain('u-otra');
    });

    it('la primera cuenta del dispositivo no dispara el aviso', () => {
        marcarInicioGoogle(AHORA - 60_000);
        expect(evaluarAccesoGoogle(NUEVA, AHORA).mostrar).toBe(false);
        expect(leerCuentas().map((x) => x.id)).toEqual(['u-nueva']);
    });

    it('EL INCIDENTE: Google trae una cuenta NUEVA mientras el dispositivo conocía otra → pregunta y NO la recuerda aún', () => {
        recordarCuenta(HABITUAL, AHORA - 86_400_000);
        marcarInicioGoogle(AHORA - 60_000);
        const d = evaluarAccesoGoogle(NUEVA, AHORA);
        expect(d).toEqual({ mostrar: true, actual: 'nu***@gmail.com', anterior: 'an***@gmail.com', nueva: true });
        expect(leerCuentas().map((x) => x.id)).toEqual(['u-habitual']);
    });

    it('una cuenta VIEJA que el dispositivo no conocía también pregunta, sin llamarla «nueva»', () => {
        recordarCuenta(HABITUAL, AHORA - 86_400_000);
        marcarInicioGoogle(AHORA - 60_000);
        const d = evaluarAccesoGoogle(OTRA_VIEJA, AHORA);
        expect(d.mostrar).toBe(true);
        expect(d.nueva).toBe(false);
    });

    it('una cuenta ya conocida no pregunta', () => {
        recordarCuenta(HABITUAL, AHORA - 86_400_000);
        recordarCuenta(OTRA_VIEJA, AHORA - 3_600_000);
        marcarInicioGoogle(AHORA - 60_000);
        expect(evaluarAccesoGoogle(OTRA_VIEJA, AHORA).mostrar).toBe(false);
    });

    it('un intento de Google abandonado (>15 min) no dispara nada, y el marcador se consume siempre', () => {
        recordarCuenta(HABITUAL, AHORA - 86_400_000);
        marcarInicioGoogle(AHORA - 16 * 60_000);
        expect(evaluarAccesoGoogle(NUEVA, AHORA).mostrar).toBe(false);
        expect(localStorage.getItem('mf_google_inicio')).toBeNull();
        // y consumido tras un aviso: la recarga no vuelve a preguntar
        localStorage.clear();
        recordarCuenta(HABITUAL, AHORA - 86_400_000);
        marcarInicioGoogle(AHORA - 60_000);
        expect(evaluarAccesoGoogle(NUEVA, AHORA).mostrar).toBe(true);
        expect(evaluarAccesoGoogle(NUEVA, AHORA + 1000).mostrar).toBe(false);
    });

    it('sin correo en el perfil no pregunta (no habría qué enseñar)', () => {
        recordarCuenta(HABITUAL, AHORA - 86_400_000);
        marcarInicioGoogle(AHORA - 60_000);
        expect(evaluarAccesoGoogle({ id: 'u-x', email: null, created_at: null }, AHORA).mostrar).toBe(false);
    });
});
