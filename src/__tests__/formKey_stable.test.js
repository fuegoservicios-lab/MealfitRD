// [P1-FORM-KEY · 2026-06-21] El form sensible se cifra con una llave ESTABLE por
// usuario (del backend) en vez del access_token de Neon (que rotaba → "se borraban"
// los datos). Estos tests anclan: (1) sobrevive rotación de token, (2) migra blobs
// viejos cifrados con el token (dual-key), (3) funciona en first-party (token null).
import { describe, it, expect, beforeEach } from 'vitest';
import {
    saveFormData,
    loadFormData,
    setFormCryptoSecret,
    hasFormCryptoSecret,
    clearFormStorage,
} from '../config/secureFormStorage';

const STABLE = 'stable-user-key-abcdefghijkl'; // ≥16 chars

describe('[P1-FORM-KEY] llave estable de cifrado del form', () => {
    beforeEach(() => {
        localStorage.clear();
        setFormCryptoSecret(null);
    });

    it('sobrevive a la rotación del access_token (cifra con la llave estable)', async () => {
        const formData = {
            age: 30,
            allergies: ['Lácteos'],
            medicalConditions: ['Diabetes T2'],
            medications: ['Metformina'],
        };
        setFormCryptoSecret(STABLE);
        expect(hasFormCryptoSecret()).toBe(true);
        // Guardado bajo el token T1...
        await saveFormData(formData, { access_token: 'token-T1' });
        // ...y leído con un token DISTINTO (rotó) pero la MISMA llave estable → descifra.
        const { sensitiveData } = await loadFormData({ access_token: 'token-T2-distinto' });
        expect(sensitiveData.allergies).toEqual(['Lácteos']);
        expect(sensitiveData.medicalConditions).toEqual(['Diabetes T2']);
        expect(sensitiveData.medications).toEqual(['Metformina']);
    });

    it('migra un blob viejo cifrado con el access_token (fallback dual-key)', async () => {
        const formData = { age: 40, allergies: ['Gluten'], medicalConditions: ['Hipertensión'] };
        // Mundo viejo: SIN llave estable → se cifra con el access_token.
        setFormCryptoSecret(null);
        await saveFormData(formData, { access_token: 'legacy-token-X' });
        // Llega la llave estable; el load la prueba primero (falla) y cae al token viejo.
        setFormCryptoSecret(STABLE);
        const { sensitiveData } = await loadFormData({ access_token: 'legacy-token-X' });
        expect(sensitiveData.allergies).toEqual(['Gluten']);
        expect(sensitiveData.medicalConditions).toEqual(['Hipertensión']);
    });

    it('descifra en first-party (access_token null) con la llave estable', async () => {
        const formData = { age: 25, allergies: ['Mariscos'], medicalConditions: ['Ninguna'] };
        setFormCryptoSecret(STABLE);
        await saveFormData(formData, { access_token: 'token-T1' });
        // Reabrir vía sesión first-party: no hay access_token, solo la llave estable.
        const { sensitiveData } = await loadFormData({ access_token: null });
        expect(sensitiveData.allergies).toEqual(['Mariscos']);
    });

    it('un blob cifrado con llave estable NO se lee con otra llave (aislamiento por usuario)', async () => {
        setFormCryptoSecret(STABLE);
        await saveFormData({ allergies: ['Soya'] }, { access_token: 'tok' });
        // Otro usuario (otra llave estable, sin token que sirva de fallback) → no descifra.
        setFormCryptoSecret('otra-llave-de-otro-user-zzz');
        const { sensitiveData } = await loadFormData({ access_token: null });
        expect(sensitiveData.allergies).toBeUndefined();
        clearFormStorage();
    });
});
