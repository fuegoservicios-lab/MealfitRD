// [P1-GUEST-FORM-PERSIST · 2026-06-21] Tests del persistido de los campos MÉDICOS del
// invitado en sessionStorage (sobrevive un refresh/F5, se borra al cerrar la pestaña) +
// los contratos de seguridad anti-leak cross-usuario.
//
// Contexto: un primer intento (sessionStorage + migración al registrarse) fue REVERTIDO
// porque una verificación adversaria encontró un leak de PII médica cross-usuario (un
// usuario registrado podía heredar las alergias/medicamentos de un invitado previo en la
// misma pestaña). Estos tests anclan el diseño seguro:
//   1. skip-empty: un snapshot todo-vacío NO sobreescribe una copia poblada (el SAVE effect
//      corre en mount con formData inicial vacío ANTES de la hidratación → sin esto, clobber).
//   2. gate !loadingAuth en la hidratación: cierra la ventana de reload donde un usuario que
//      inicia sesión (session aún null en mount) heredaría la data de un invitado.
//   3. limpieza en activateGuestMode: anti bleed cross-guest en la misma pestaña.
//   4. sessionStorage (no localStorage): cero PII médica plana persistente en disco.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    saveGuestSensitiveFields,
    loadGuestSensitiveFields,
    clearGuestSensitiveFields,
    GUEST_SENSITIVE_KEY,
} from '../config/secureFormStorage';

describe('[P1-GUEST-FORM-PERSIST] helpers sessionStorage', () => {
    beforeEach(() => {
        try { sessionStorage.clear(); localStorage.clear(); } catch { /* noop */ }
    });

    it('roundtrip: guarda y lee los campos sensibles del invitado', () => {
        saveGuestSensitiveFields({ allergies: ['Maní'], medications: ['Aspirina'] });
        expect(loadGuestSensitiveFields()).toEqual({ allergies: ['Maní'], medications: ['Aspirina'] });
    });

    it('solo persiste campos sensibles (NO los públicos como age/gender)', () => {
        saveGuestSensitiveFields({ allergies: ['Maní'], age: 30, gender: 'male' });
        const loaded = loadGuestSensitiveFields();
        expect(loaded).toEqual({ allergies: ['Maní'] });
        expect(loaded.age).toBeUndefined();
    });

    it('SKIP si todos los sensibles están vacíos (no escribe nada)', () => {
        saveGuestSensitiveFields({ allergies: [], medicalConditions: [], motivation: '', bodyFat: '' });
        expect(loadGuestSensitiveFields()).toBeNull();
    });

    it('CRÍTICO: un snapshot todo-vacío NO sobreescribe una copia poblada (anti-clobber del mount)', () => {
        saveGuestSensitiveFields({ allergies: ['Maní'], medications: ['Aspirina'] });
        // Simula el SAVE effect corriendo en mount con el formData inicial (sensibles vacíos)
        // ANTES de que la hidratación restaure — sin el skip-empty esto borraría la data.
        saveGuestSensitiveFields({ allergies: [], medications: [], motivation: '' });
        expect(loadGuestSensitiveFields()).toEqual({ allergies: ['Maní'], medications: ['Aspirina'] });
    });

    it('clearGuestSensitiveFields borra la copia', () => {
        saveGuestSensitiveFields({ allergies: ['Maní'] });
        clearGuestSensitiveFields();
        expect(loadGuestSensitiveFields()).toBeNull();
    });

    it('usa sessionStorage, NO localStorage (cero PII médica plana persistente)', () => {
        saveGuestSensitiveFields({ allergies: ['Maní'] });
        expect(sessionStorage.getItem(GUEST_SENSITIVE_KEY)).toBeTruthy();
        expect(localStorage.getItem(GUEST_SENSITIVE_KEY)).toBeNull();
    });
});

describe('[P1-GUEST-FORM-PERSIST] modo privado (sessionStorage lanza)', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('saveGuestSensitiveFields no crashea si setItem lanza', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError'); });
        expect(() => saveGuestSensitiveFields({ allergies: ['Maní'] })).not.toThrow();
    });

    it('loadGuestSensitiveFields devuelve null si getItem lanza (no crashea)', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        expect(loadGuestSensitiveFields()).toBeNull();
    });
});

// --- Parser anchors del diseño seguro en AssessmentContext.jsx ---
const __dirname = dirname(fileURLToPath(import.meta.url));
const CTX = readFileSync(join(__dirname, '..', 'context', 'AssessmentContext.jsx'), 'utf8');

describe('[P1-GUEST-FORM-PERSIST] contratos de seguridad (parser)', () => {
    it('marker presente', () => {
        expect(CTX).toMatch(/\[P1-GUEST-FORM-PERSIST\s*·\s*2026-06-21\]/);
    });

    it('la HIDRATACIÓN de invitado está gateada por !loadingAuth (cierra la ventana de reload cross-usuario)', () => {
        // El gate !loadingAuth es lo que impide que un usuario que inicia sesión (session
        // aún null en el mount) herede la data de un invitado previo. Si un refactor lo
        // quita, este test falla ANTES de reintroducir el leak.
        const idx = CTX.indexOf('const guestSensitive = loadGuestSensitiveFields');
        expect(idx).toBeGreaterThan(-1);
        const region = CTX.slice(Math.max(0, idx - 400), idx);
        expect(region).toMatch(/!loadingAuth\s*&&\s*isGuestModeActive\(\)/);
    });

    it('el SAVE de invitado está gateado por !session (no persiste copia plana para un usuario logueado)', () => {
        expect(CTX).toMatch(/if\s*\(\s*!session\s*&&\s*isGuestModeActive\(\)\s*\)/);
    });

    it('activateGuestMode limpia la copia de invitado ANTES de activar el modo (orden load-bearing anti bleed cross-guest)', () => {
        const idx = CTX.indexOf('const activateGuestMode = useCallback');
        expect(idx).toBeGreaterThan(-1);
        const block = CTX.slice(idx, idx + 1800);
        const clearIdx = block.indexOf('clearGuestSensitiveFields');
        const activateIdx = block.indexOf('activateGuestModeStorage');
        expect(clearIdx).toBeGreaterThan(-1);
        expect(activateIdx).toBeGreaterThan(-1);
        // El clear DEBE preceder a activateGuestModeStorage() (que pone isGuestModeActive()=true,
        // condición bajo la cual el hydrate lee el blob). Si se reordena → bleed cross-guest.
        expect(clearIdx).toBeLessThan(activateIdx);
    });

    it('exitGuestSession limpia la copia de invitado (dispositivo compartido)', () => {
        const idx = CTX.indexOf('const exitGuestSession = useCallback');
        expect(idx).toBeGreaterThan(-1);
        const block = CTX.slice(idx, idx + 700);
        expect(block).toMatch(/clearGuestSensitiveFields\s*\(\s*\)/);
    });
});
