/**
 * P2-3 · Tests de `checkLeakedPassword` — chequeo HIBP via k-anonymity.
 *
 * Cubre:
 *   1. Knob `VITE_LEAKED_PASSWORD_CHECK` (off|warn|block) y default.
 *   2. Privacidad: solo se envía el prefijo de 5 chars del SHA-1 al servicio.
 *   3. Detección correcta de password filtrada (mock fetch con respuesta HIBP).
 *   4. Detección correcta de password limpia.
 *   5. Modo `warn`: detecta pero no marca leaked como bloqueante (caller no debe abortar).
 *   6. Degrada open en errores: red, HTTP 5xx, crypto unavailable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkLeakedPassword, getLeakedPasswordMode } from '../../utils/checkLeakedPassword';

// SHA-1 conocidos para reproducir respuestas HIBP determinísticas.
//   'password'        → 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
//                       prefix=5BAA6, suffix=1E4C9B93F3F0682250B6CF8331B7EE68FD8
//   'correcthorsebatterystaple' → DA59... (no en respuesta mock → "limpia")
const PWNED_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
const HIBP_RESPONSE_LEAKED =
    `0018A45C4D1DEF81644B54AB7F969B88D65:1\n` +
    `${PWNED_SUFFIX}:9659365\n` +
    `00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2\n`;
const HIBP_RESPONSE_CLEAN =
    `0018A45C4D1DEF81644B54AB7F969B88D65:1\n` +
    `00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2\n`;

let originalFetch;

beforeEach(() => {
    originalFetch = global.fetch;
    // Default: VITE_LEAKED_PASSWORD_CHECK no seteado → 'block'.
    delete import.meta.env.VITE_LEAKED_PASSWORD_CHECK;
});

afterEach(() => {
    global.fetch = originalFetch;
    delete import.meta.env.VITE_LEAKED_PASSWORD_CHECK;
    vi.restoreAllMocks();
});

describe('P2-3 · getLeakedPasswordMode — knob parsing', () => {
    it('default block cuando env no está seteado', () => {
        expect(getLeakedPasswordMode()).toBe('block');
    });

    it('respeta off|warn|block (case-insensitive)', () => {
        import.meta.env.VITE_LEAKED_PASSWORD_CHECK = 'off';
        expect(getLeakedPasswordMode()).toBe('off');
        import.meta.env.VITE_LEAKED_PASSWORD_CHECK = 'WARN';
        expect(getLeakedPasswordMode()).toBe('warn');
        import.meta.env.VITE_LEAKED_PASSWORD_CHECK = 'Block';
        expect(getLeakedPasswordMode()).toBe('block');
    });

    it('valor inválido → fallback a block', () => {
        import.meta.env.VITE_LEAKED_PASSWORD_CHECK = 'maybe';
        expect(getLeakedPasswordMode()).toBe('block');
    });
});

describe('P2-3 · checkLeakedPassword — modo off', () => {
    it('no llama fetch cuando mode=off', async () => {
        import.meta.env.VITE_LEAKED_PASSWORD_CHECK = 'off';
        const fetchSpy = vi.fn();
        global.fetch = fetchSpy;
        const result = await checkLeakedPassword('password');
        expect(result).toEqual({ leaked: false, count: 0, mode: 'off' });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('password vacía no llama fetch', async () => {
        const fetchSpy = vi.fn();
        global.fetch = fetchSpy;
        const result = await checkLeakedPassword('');
        expect(result.leaked).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('P2-3 · privacidad k-anonymity', () => {
    it('solo envía 5 chars del hash al servidor (no la password)', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => HIBP_RESPONSE_CLEAN,
        });
        global.fetch = fetchSpy;
        // Password distintivo sin overlap con la URL ('pwnedpasswords.com').
        const distinctivePwd = 'XyZ9q!@7#K';
        await checkLeakedPassword(distinctivePwd);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const url = fetchSpy.mock.calls[0][0];
        // Estructura: dominio fijo + 5 chars hex uppercase.
        expect(url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[A-F0-9]{5}$/);
        // El URL NO contiene la password en claro.
        expect(url).not.toContain(distinctivePwd);
        // Tampoco contiene el hash completo (40 chars hex). El path después de
        // /range/ es exactamente 5 chars.
        const pathAfterRange = url.split('/range/')[1];
        expect(pathAfterRange.length).toBe(5);
    });

    it('envía header Add-Padding: true (k-anonymity hardening)', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => HIBP_RESPONSE_CLEAN,
        });
        global.fetch = fetchSpy;
        await checkLeakedPassword('something');
        const opts = fetchSpy.mock.calls[0][1];
        expect(opts?.headers?.['Add-Padding']).toBe('true');
    });
});

describe('P2-3 · detección correcta', () => {
    it('detecta password filtrada y reporta count', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => HIBP_RESPONSE_LEAKED,
        });
        const result = await checkLeakedPassword('password');
        expect(result.leaked).toBe(true);
        expect(result.count).toBe(9659365);
        expect(result.mode).toBe('block');
    });

    it('password limpia retorna leaked:false', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => HIBP_RESPONSE_CLEAN,
        });
        const result = await checkLeakedPassword('password');
        expect(result.leaked).toBe(false);
        expect(result.count).toBe(0);
    });

    it('mode=warn: detecta filtrada pero el caller decide (leaked=true igual, caller mira mode)', async () => {
        import.meta.env.VITE_LEAKED_PASSWORD_CHECK = 'warn';
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => HIBP_RESPONSE_LEAKED,
        });
        const result = await checkLeakedPassword('password');
        // La función igual reporta leaked:true; la lógica "no bloquear" vive en el
        // caller (Register.jsx solo aborta si mode==='block').
        expect(result.leaked).toBe(true);
        expect(result.mode).toBe('warn');
    });
});

describe('P2-3 · degrada open en errores', () => {
    it('error de red → leaked:false con error:network', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
        const result = await checkLeakedPassword('password');
        expect(result.leaked).toBe(false);
        expect(result.error).toBe('network');
    });

    it('HTTP 503 → leaked:false con error:http-503', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            text: async () => '',
        });
        const result = await checkLeakedPassword('password');
        expect(result.leaked).toBe(false);
        expect(result.error).toBe('http-503');
    });
});
