/**
 * Tests P1-14: `handleSkipToLastStep` aborta con toast neutral si
 * `loadingSensitive=true` (hidratación del formData en vuelo).
 *
 * Bug original (audit P1-14):
 *   El handler `handleSkipToLastStep` (que el usuario invoca con el botón
 *   "Saltar a la última pregunta") evaluaba `findFirstIncompleteField`
 *   sin chequear `loadingSensitive`. Si el usuario hacía login + click
 *   rápido en "Saltar" durante la ventana de descifrado de
 *   `mealfit_form_secure` (~50-200ms) o el `fetchProfile` desde DB
 *   (~100-500ms en primer login en otro dispositivo):
 *     - `allergies` = `[]` (default), `motivation` = `''` (default), etc.
 *     - `findFirstIncompleteField` retornaba `'allergies'` (primer faltante).
 *     - Toast: "Antes de saltar, completa: Alergias" + redirect a step 10.
 *   PERO los datos SÍ estaban en storage cifrado o en DB — solo no
 *   habían terminado de hidratarse al state.
 *
 *   Mismo patrón ya cubierto por:
 *     - `onFinish` de QSupplements (línea 220 — P1-3).
 *     - `Plan.jsx` useEffect (P0-13).
 *   Olvidado en `handleSkipToLastStep` hasta P1-14.
 *
 * Fix:
 *   Guard al inicio del handler:
 *     `if (loadingSensitive) { toast.info('Cargando tus datos…'); return; }`
 *   Antes del `findFirstIncompleteField`. Toast neutral (no "error") porque
 *   no es un fallo del usuario — es un estado transitorio de la app.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FLOW_PATH = path.resolve(__dirname, '..', 'components', 'assessment', 'InteractiveAssessmentFlow.jsx');
const src = fs.readFileSync(FLOW_PATH, 'utf-8');
const codeOnly = src
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');


describe('P1-14 — handleSkipToLastStep guarda contra loadingSensitive', () => {
    // Extraer el cuerpo del handler para asertions quirúrgicas.
    const handlerMatch = codeOnly.match(
        /const\s+handleSkipToLastStep\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\};/
    );
    const handlerBody = handlerMatch ? handlerMatch[1] : '';

    it('Bloque del handler fue extraído correctamente', () => {
        expect(handlerBody).toBeTruthy();
        expect(handlerBody.length).toBeGreaterThan(50);
    });

    it('Contiene early-return cuando loadingSensitive=true', () => {
        // Patrón canónico: `if (loadingSensitive) { ... return; }`.
        const guardPattern = /if\s*\(\s*loadingSensitive\s*\)\s*\{[\s\S]*?return\s*;?\s*\}/;
        expect(handlerBody).toMatch(guardPattern);
    });

    it('Muestra toast neutral (info) cuando loadingSensitive=true', () => {
        // Buscamos `toast.info(...)` dentro del bloque del guard.
        // El bloque del guard contiene un toast.info con el mensaje "Cargando".
        const toastPattern = /if\s*\(\s*loadingSensitive\s*\)\s*\{[\s\S]*?toast\.info\([\s\S]*?\}/;
        expect(handlerBody).toMatch(toastPattern);
    });

    it('El guard ocurre ANTES de findFirstIncompleteField', () => {
        // Posición textual: el guard debe estar antes de la llamada a
        // findFirstIncompleteField, sino se ejecuta la lógica con datos
        // potencialmente vacíos.
        const guardIdx = handlerBody.indexOf('loadingSensitive');
        const findFieldIdx = handlerBody.indexOf('findFirstIncompleteField');
        expect(guardIdx).toBeGreaterThan(-1);
        expect(findFieldIdx).toBeGreaterThan(-1);
        expect(guardIdx).toBeLessThan(findFieldIdx);
    });

    it('Comentario [P1-14] documenta el rationale', () => {
        expect(src).toMatch(/\[P1-14\]/);
    });
});


describe('P1-14 — Simetría con onFinish de QSupplements (P1-3)', () => {
    it('Ambos handlers usan el mismo patrón de guard', () => {
        // El handler `onFinish` ya tenía el guard P1-3; ahora P1-14
        // replica el patrón. Los dos toasts neutrales deben coexistir
        // (cada uno en su handler).
        const occurrences = codeOnly.match(/if\s*\(\s*loadingSensitive\s*\)/g);
        expect(occurrences).toBeTruthy();
        expect(occurrences.length).toBeGreaterThanOrEqual(2);
    });
});


describe('P1-14 — Defensa contra reintroducción del bug', () => {
    it('handleSkipToLastStep NO llama findFirstIncompleteField sin guardar primero', () => {
        // Patrón roto: `findFirstIncompleteField(formData)` como PRIMERA
        // statement del handler (sin guard antes).
        const handlerMatch = codeOnly.match(
            /const\s+handleSkipToLastStep\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\};/
        );
        const body = handlerMatch[1];
        // Verificamos que el guard de loadingSensitive esté declarado
        // antes (mismo test que arriba pero más estricto contra regresión).
        const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
        const guardLineIdx = lines.findIndex((l) => /loadingSensitive/.test(l));
        const findLineIdx = lines.findIndex((l) => /findFirstIncompleteField\(/.test(l));
        expect(guardLineIdx).toBeGreaterThan(-1);
        expect(findLineIdx).toBeGreaterThan(-1);
        expect(guardLineIdx).toBeLessThan(findLineIdx);
    });
});
