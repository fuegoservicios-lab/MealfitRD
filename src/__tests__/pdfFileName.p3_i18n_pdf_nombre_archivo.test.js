/**
 * [P3-I18N-PDF-NOMBRE-ARCHIVO · 2026-08-22] El nombre del fichero que se descarga.
 *
 * El guard estructural vive en `test_p2_pdf_wordmark_en_cadena.py`. Aquí, la conducta —y en
 * particular lo que un copy TRADUCIDO puede meter en un nombre de fichero, que es la razón
 * de que esto sea un saneador y no un `replace(/ /g, '_')`.
 */
import { describe, it, expect } from 'vitest';
import { pdfFileName } from '../utils/pdfFileName';

describe('pdfFileName', () => {
    it('une las partes con guion bajo y añade la extensión', () => {
        expect(pdfFileName('Shopping List', '7 days', '2026-08-22', 'ab12cd34')).toBe(
            'Shopping_List_7_days_2026-08-22_ab12cd34.pdf',
        );
    });

    it('quita los caracteres que un nombre de fichero NO admite', () => {
        // fr-FR escribe «Liste : 7 jours» con dos puntos; en Windows eso no es un nombre.
        expect(pdfFileName('Liste : 7 jours', 'x')).toBe('Liste_7_jours_x.pdf');
        expect(pdfFileName('a/b\\c*d?e"f<g>h|i', 'z')).toBe('a_b_c_d_e_f_g_h_i_z.pdf');
    });

    it('quita los diacríticos, para que el nombre viaje entre sistemas de ficheros', () => {
        expect(pdfFileName('Lista de Compras', 'Nutrição')).toBe('Lista_de_Compras_Nutricao.pdf');
        expect(pdfFileName('Receta', 'Salmón al ajillo')).toBe('Receta_Salmon_al_ajillo.pdf');
    });

    it('no deja guiones bajos dobles ni en los extremos', () => {
        expect(pdfFileName('  hola  ', '', null, undefined, 'mundo')).toBe('hola_mundo.pdf');
        expect(pdfFileName('a', '   ', 'b')).toBe('a_b.pdf');
    });

    it('conserva la fecha ISO y el prefijo del plan intactos', () => {
        const out = pdfFileName('Einkaufsliste', '30 Tage', '2026-08-22', 'f380821a');
        expect(out).toContain('2026-08-22');
        expect(out).toContain('f380821a');
    });

    it('nunca devuelve un nombre vacío', () => {
        expect(pdfFileName()).toBe('documento.pdf');
        expect(pdfFileName('', null, '   ')).toBe('documento.pdf');
        expect(pdfFileName('¿?¡!')).toBe('documento.pdf');
    });
});
