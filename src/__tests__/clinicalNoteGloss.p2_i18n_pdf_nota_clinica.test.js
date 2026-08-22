/**
 * [P2-I18N-PDF-NOTA-CLINICA · 2026-08-22] La conducta del glosador de la nota clínica.
 *
 * El guard de paridad vive en el backend (`test_p2_i18n_pdf_nota_clinica.py`) porque el
 * modo de fallo real es que el copy cambie en `graph_orchestrator.py`. Aquí se prueba lo
 * otro: que la sustitución HACE algo, que la cifra del tope renal sobrevive en su sitio y
 * que las tres formas de fallar degradan a español en vez de romper el PDF.
 */
import { describe, it, expect } from 'vitest';
import {
    glossClinicalNote,
    CLAVES_NOTA_CLINICA,
    CLAVES_NOTA_CLINICA_TODAS,
} from '../utils/clinicalNoteGloss';

/** Una `t` de mentira: mayúsculas + marca, para ver a simple vista qué se tradujo. */
const tFalsa = (clave, vars) => {
    let out = `«${clave.trim().toUpperCase()}»`;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`.toUpperCase(), v);
    return out;
};

/** La nota renal COMPLETA, tal y como la compone el orquestador. */
const NOTA_RENAL =
    '🫘 CONDICIÓN RENAL DETECTADA — IMPORTANTE: la nutrición en enfermedad renal depende de tu estadio (G1–G5) y de si estás en diálisis, y DEBE ser supervisada por tu nefrólogo o nutricionista renal.' +
    ' Se aplicó un límite conservador de proteína a ~62g/día (≈0.8 g/kg) como medida de seguridad.' +
    ' Este plan NO es una prescripción renal: el potasio y el fósforo (críticos en ERC) no se ajustan aquí.' +
    ' NO sigas este plan sin la validación de tu profesional de salud. ' +
    '⚕️ Declaraste condición(es) de salud (Enfermedad Renal, Diabetes Tipo 2). Este plan las considera de forma general pero NO sustituye la evaluación de tu médico o nutricionista. Consúltalo antes de seguir este plan, especialmente para ajustar porciones, sodio, azúcares o restricciones específicas.';

describe('glossClinicalNote', () => {
    it('traduce TODOS los fragmentos fijos de la nota renal completa', () => {
        const out = glossClinicalNote(NOTA_RENAL, tFalsa);
        for (const clave of CLAVES_NOTA_CLINICA) {
            expect(out).not.toContain(clave);
        }
        // …y no se limitó a devolverla intacta.
        expect(out).not.toBe(NOTA_RENAL);
        expect(out).toContain('«');
    });

    it('conserva las cifras del tope renal, que son DATO y no copy', () => {
        const out = glossClinicalNote(NOTA_RENAL, tFalsa);
        expect(out).toContain('62');
        expect(out).toContain('0.8');
        expect(out).not.toContain('{proteina}');
        expect(out).not.toContain('{gkg}');
    });

    it('NO traduce los nombres de las condiciones declaradas', () => {
        // Son los chips exactos de QMedical y el backend los compara por igualdad de string.
        const out = glossClinicalNote(NOTA_RENAL, tFalsa);
        expect(out).toContain('Enfermedad Renal, Diabetes Tipo 2');
    });

    it('degrada a español en vez de romper: sin t, con basura, y con una t que lanza', () => {
        expect(glossClinicalNote(NOTA_RENAL, undefined)).toBe(NOTA_RENAL);
        expect(glossClinicalNote(NOTA_RENAL, null)).toBe(NOTA_RENAL);
        expect(glossClinicalNote(null, tFalsa)).toBe(null);
        expect(glossClinicalNote('', tFalsa)).toBe('');
        expect(glossClinicalNote(NOTA_RENAL, () => { throw new Error('catálogo roto'); })).toBe(
            NOTA_RENAL,
        );
    });

    it('en es-DO la nota sale BYTE a BYTE igual (es la que ve hoy el 100% de los usuarios)', () => {
        // es-DO no lleva catálogo: `t` devuelve la clave y la interpola. La nota no debe
        // moverse ni un espacio.
        const tEsDO = (clave, vars) =>
            vars
                ? Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), clave)
                : clave;
        expect(glossClinicalNote(NOTA_RENAL, tEsDO)).toBe(NOTA_RENAL);
    });

    it('una t que ignora sus vars NO imprime «{proteina}» en la advertencia renal', () => {
        // El paso de la plantilla no puede filtrar por `tr !== es` (en es-DO son el mismo
        // texto y aun así hay que interpolar), así que la red es mirar el RESULTADO. Sin
        // ella, el PDF saldría con un placeholder crudo donde va el tope de proteína.
        const out = glossClinicalNote(NOTA_RENAL, (clave) => clave);
        expect(out).not.toContain('{proteina}');
        expect(out).not.toContain('{gkg}');
        expect(out).toContain('~62g/día (≈0.8 g/kg)');
    });

    it('una nota sin ningún fragmento conocido pasa intacta', () => {
        const ajena = 'Texto clínico que este glosador no conoce.';
        expect(glossClinicalNote(ajena, tFalsa)).toBe(ajena);
    });

    it('el inventario del guard incluye la plantilla del tope, no sólo los fijos', () => {
        expect(CLAVES_NOTA_CLINICA_TODAS.length).toBe(CLAVES_NOTA_CLINICA.length + 1);
        expect(CLAVES_NOTA_CLINICA_TODAS.some((c) => c.includes('{proteina}'))).toBe(true);
    });
});
