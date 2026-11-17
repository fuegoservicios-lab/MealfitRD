// [P1-PLAN-LOTE-1034 · 2026-11-17] El informe para el médico en PDF: texto real (no una imagen), A4, con el aviso en
// el pie de CADA página. `jspdf` entra con `import()` dentro de la acción: nunca en el arranque de la app.
//
// Las fuentes estándar de jsPDF solo conocen Latin-1: el espacio fino del francés (U+202F) y los signos fuera de
// Latin-1 se cambian por equivalentes antes de escribir (si no, salen como basura en el PDF).

// Por código de carácter (no con expresiones regulares: lint veta los espacios raros y los controles en ellas).
const _CAMBIOS = new Map([[0x202F, ' '], [0x00A0, ' '], [0x2018, "'"], [0x2019, "'"], [0x201C, '"'],
    [0x201D, '"'], [0x2013, '-'], [0x2014, '-'], [0x2026, '...']]);
const _LATIN1 = (s) => Array.from(String(s ?? ''), (c) => {
    const n = c.codePointAt(0);
    if (_CAMBIOS.has(n)) return _CAMBIOS.get(n);
    if (n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 126) || (n >= 160 && n <= 255)) return c;
    return '';
}).join('');

/**
 * @param {{titulo: string, subtitulo: string, aviso: string, bloques: Array<{titulo: string, lineas: string[]}>}} doc
 *        el informe ya traducido (lo arma la pantalla con `t()`): aquí no se traduce ni se calcula nada.
 * @returns {Promise<Blob>}
 */
export async function pdfDelInforme(doc) {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const ANCHO = 210;
    const ALTO = 297;
    const M = 16;
    const util = ANCHO - 2 * M;
    const PIE = 22;
    let y = M;

    const pie = () => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(90);
        const lineas = pdf.splitTextToSize(_LATIN1(doc.aviso), util);
        pdf.text(lineas, M, ALTO - PIE + 6);
        pdf.setTextColor(0);
    };
    const saltoSiHaceFalta = (alto) => {
        if (y + alto > ALTO - PIE) {
            pie();
            pdf.addPage();
            y = M;
        }
    };
    const parrafo = (texto, { tam = 10, negrita = false, antes = 0, despues = 1.5 } = {}) => {
        pdf.setFont('helvetica', negrita ? 'bold' : 'normal');
        pdf.setFontSize(tam);
        const lineas = pdf.splitTextToSize(_LATIN1(texto), util);
        const alto = lineas.length * tam * 0.42;
        y += antes;
        saltoSiHaceFalta(alto);
        pdf.text(lineas, M, y + tam * 0.35);
        y += alto + despues;
    };

    parrafo(doc.titulo, { tam: 16, negrita: true, despues: 1 });
    parrafo(doc.subtitulo, { tam: 10, despues: 4 });
    for (const b of doc.bloques || []) {
        if (!b || !b.lineas || !b.lineas.length) continue;
        parrafo(b.titulo, { tam: 12, negrita: true, antes: 2, despues: 1.5 });
        for (const l of b.lineas) parrafo(l, { tam: 10, despues: 1 });
    }
    pie();
    return pdf.output('blob');
}

export const _paraPruebas = { _LATIN1 };
