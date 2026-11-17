// [P1-PLAN-LOTE-1034] El PDF del informe se genera sin red y lleva el aviso en el pie.
import { describe, it, expect } from 'vitest';
import { pdfDelInforme, _paraPruebas } from '../utils/informeMedicoPdf';

const textoDe = async (blob) => {
    if (typeof blob.text === 'function') return blob.text();
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(blob); });
};

describe('[1034] PDF del informe', () => {
    it('el texto pasa a Latin-1 (espacio fino del francés, comillas tipográficas)', () => {
        expect(_paraPruebas._LATIN1('Allergies : x % «a» ’b’ c…')).toBe('Allergies : x % «a» \'b\' c...');
    });

    it('genera un PDF A4 con el aviso y las secciones', async () => {
        const blob = await pdfDelInforme({
            titulo: 'Informe para tu medico',
            subtitulo: 'Del 19 oct al 17 nov',
            aviso: 'AVISO-FIJO no es un diagnostico',
            bloques: [{ titulo: 'Energia', lineas: Array.from({ length: 90 }, (_, i) => `Linea ${i}`) }],
        });
        expect(blob.size).toBeGreaterThan(500);
        const txt = await textoDe(blob);
        expect(txt.startsWith('%PDF')).toBe(true);
        expect((txt.match(/AVISO-FIJO/g) || []).length).toBeGreaterThanOrEqual(2);   // el pie en CADA página (2+)
        expect(txt).toContain('Linea 89');
    });
});
