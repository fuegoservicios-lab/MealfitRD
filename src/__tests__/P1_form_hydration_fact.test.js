// [P1-FORM-HYDRATION-FACT · 2026-08-09] En una cuenta CON SESIÓN, las respuestas
// de los pasos sensibles del wizard desaparecían en CADA refresco. Como invitado
// no pasaba — y esa asimetría fue la que localizó el defecto.
//
// CAUSA: la guarda anti-clobber del camino autenticado no borraba el dato, se
// NEGABA A GUARDARLO. Deducía "la hidratación falló" de que ciertos arrays
// sensibles vinieran vacíos. Pero vacío es TAMBIÉN el estado legítimo de quien
// todavía no ha llegado a ese paso del wizard (y de quien no tiene nada que
// declarar). Al no poder distinguir "falló" de "todavía no", bloqueaba toda
// escritura sensible durante casi todo el formulario.
//
//   Un centinela que no distingue «falló» de «todavía no» acaba castigando el
//   caso normal para protegerse del raro.
//
// ARREGLO: decidir por el HECHO de si el blob se leyó, no por su contenido.
//
// Estos tests corren contra el MÓDULO REAL (WebCrypto de jsdom), no contra una
// imitación: es la diferencia entre anclar el arreglo y anclar mi idea de él.
import { describe, it, expect, beforeEach } from 'vitest';
import {
    saveFormData,
    loadFormData,
    clearFormStorage,
    setFormCryptoSecret,
    getFormHydrationState,
    resetFormHydrationState,
} from '../config/secureFormStorage';

const STABLE = 'stable-user-key-abcdefghijkl'; // ≥16 chars
const SESSION = { user: { id: 'u-1' }, access_token: null }; // first-party: token anulado
const SECURE_KEY = 'mealfit_form_secure';

/** Simula un F5: la memoria del módulo muere, el localStorage sobrevive. */
const simularRefresco = async () => {
    resetFormHydrationState();
    return loadFormData(SESSION);
};

describe('[P1-FORM-HYDRATION-FACT] el wizard conserva lo contestado al refrescar', () => {
    beforeEach(() => {
        localStorage.clear();
        setFormCryptoSecret(STABLE);
        resetFormHydrationState();
    });

    it('persiste un paso sensible contestado ANTES que los dos que vigilaba la guarda', async () => {
        // El orden del wizard es el que destapa el defecto: alergias (13) y
        // "alimentos que no me gustan" (14) se contestan ANTES que condiciones
        // médicas (16). Con la deducción por contenido, todo lo tecleado hasta
        // el paso 16 se descartaba en silencio.
        await saveFormData({ age: 30, allergies: ['Maní'], medicalConditions: [] }, SESSION);
        await simularRefresco();

        // El usuario avanza al paso 14 SIN haber llegado aún al 16.
        await saveFormData(
            { age: 30, allergies: ['Maní'], medicalConditions: [], dislikes: ['Cilantro'] },
            SESSION,
        );

        const { sensitiveData } = await simularRefresco();
        expect(sensitiveData.dislikes).toEqual(['Cilantro']);
        expect(sensitiveData.allergies).toEqual(['Maní']);
    });

    it('sobrevive a una cadena de refrescos, que es como lo vive el usuario', async () => {
        // No basta con un refresco: el fallo original se re-armaba solo, porque el
        // paso del wizard SÍ se guardaba y el usuario volvía a un punto avanzado
        // con los arrays vigilados todavía vacíos.
        await saveFormData({ allergies: ['Maní'], medicalConditions: [] }, SESSION);
        await simularRefresco();
        await saveFormData({ allergies: ['Maní'], medicalConditions: [], motivation: 'Salud' }, SESSION);
        await simularRefresco();
        await saveFormData(
            { allergies: ['Maní'], medicalConditions: [], motivation: 'Salud', struggles: ['Tiempo'] },
            SESSION,
        );

        const { sensitiveData } = await simularRefresco();
        expect(sensitiveData.motivation).toBe('Salud');
        expect(sensitiveData.struggles).toEqual(['Tiempo']);
    });

    it('deja declarar "no tengo nada" sin quedar bloqueado para siempre', async () => {
        // Un usuario sin alergias ni condiciones es un usuario válido, no una
        // hidratación rota. La versión anterior no podía distinguirlo.
        await saveFormData({ allergies: [], medicalConditions: [], motivation: 'Bajar de peso' }, SESSION);
        const { sensitiveData } = await simularRefresco();
        expect(sensitiveData.motivation).toBe('Bajar de peso');
    });

    it('la protección original SIGUE viva: sin lectura confirmada no se pisa el blob', async () => {
        // Este es el caso que la guarda existía para cubrir, y no puede perderse
        // al arreglar el otro. Un arreglo que lo rompa deja al usuario peor.
        await saveFormData({ allergies: ['Maní'], medicalConditions: ['Diabetes'] }, SESSION);
        const bueno = localStorage.getItem(SECURE_KEY);

        // Refresco en el que la llave NO llega: el blob no se puede abrir.
        resetFormHydrationState();
        setFormCryptoSecret(null);
        await loadFormData({ user: { id: 'u-1' } });
        expect(getFormHydrationState()).not.toBe('resolved');

        // El effect de guardado dispara con el formData inicial (vacío).
        setFormCryptoSecret(STABLE);
        await saveFormData({ allergies: [], medicalConditions: [], dislikes: [] }, SESSION);

        expect(localStorage.getItem(SECURE_KEY)).toBe(bueno);
        const { sensitiveData } = await simularRefresco();
        expect(sensitiveData.allergies).toEqual(['Maní']);
    });

    it('BORRAR una alergia se persiste (un merge la habría dejado para siempre)', async () => {
        // La tentación al arreglar esto es mergear en vez de reemplazar. Sería
        // peor: en una app clínica, una alergia que el usuario quita y reaparece
        // es un dato falso sobre su cuerpo que él ya no puede corregir.
        await saveFormData({ allergies: ['Maní', 'Lácteos'], medicalConditions: ['Diabetes'] }, SESSION);
        await simularRefresco();
        await saveFormData({ allergies: ['Maní'], medicalConditions: ['Diabetes'] }, SESSION);

        const { sensitiveData } = await simularRefresco();
        expect(sensitiveData.allergies).toEqual(['Maní']);
    });

    it('no estrena el blob con un objeto íntegramente vacío', async () => {
        await saveFormData({ age: 30, allergies: [], medicalConditions: [] }, SESSION);
        expect(localStorage.getItem(SECURE_KEY)).toBeNull();
        // El público sí se guarda: el usuario no pierde edad/peso/presupuesto.
        expect(JSON.parse(localStorage.getItem('mealfit_form')).age).toBe(30);
    });

    it('un blob sin llave disponible queda "todavía no", nunca "falló"', async () => {
        await saveFormData({ allergies: ['Maní'], medicalConditions: ['Diabetes'] }, SESSION);
        resetFormHydrationState();
        setFormCryptoSecret(null);
        await loadFormData({ user: { id: 'u-1' } });
        // Distinguir ambos importa: "falló" es definitivo, "todavía no" se repara
        // solo cuando la llave llega del backend.
        expect(getFormHydrationState()).toBe('pending');
    });

    it('cerrar sesión desbloquea la pestaña para el siguiente usuario', async () => {
        await saveFormData({ allergies: ['Maní'], medicalConditions: ['Diabetes'] }, SESSION);
        clearFormStorage();
        expect(getFormHydrationState()).toBe('resolved');
        await saveFormData({ allergies: ['Mariscos'], medicalConditions: [] }, SESSION);
        const { sensitiveData } = await simularRefresco();
        expect(sensitiveData.allergies).toEqual(['Mariscos']);
    });
});
