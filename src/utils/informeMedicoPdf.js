// [P1-PLAN-LOTE-1034 · 2026-11-17] El informe para el médico en PDF: texto real (no una imagen), A4, diseño clínico
// estructurado con tarjetas ejecutivas, gráficas vectoriales por semana y aviso legal + paginación en CADA página.
// `jspdf` entra con `import()` dentro de la acción: nunca en el arranque de la app.
//
// Las fuentes estándar de jsPDF solo conocen Latin-1: el espacio fino del francés (U+202F) y los signos fuera de
// Latin-1 se cambian por equivalentes antes de escribir (si no, salen como basura en el PDF).

// Por código de carácter (no con expresiones regulares: lint veta los espacios raros y los controles en ellas).
const _CAMBIOS = new Map([[0x202F, ' '], [0x00A0, ' '], [0x2018, "'"], [0x2019, "'"], [0x201C, '"'],
    [0x201D, '"'], [0x2013, '-'], [0x2014, '-'], [0x2026, '...'], [0x2022, '-']]);
const _LATIN1 = (s) => Array.from(String(s ?? ''), (c) => {
    const n = c.codePointAt(0);
    if (_CAMBIOS.has(n)) return _CAMBIOS.get(n);
    if (n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 126) || (n >= 160 && n <= 255)) return c;
    return '';
}).join('');

const _IDS_CLINICOS = new Set(['resumen', 'hallazgos', 'preguntas']);

/**
 * @param {{titulo: string, subtitulo: string, aviso: string, bloques: Array<{id?: string, titulo: string, lineas: string[]}>, graficas?: Array<{titulo: string, filas: Array<{etiqueta: string, valorTexto: string, pct: number, metaPct?: number}>}>}} doc
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
    const PIE = 24;
    let y = 14;

    const pintarFranjaSuperior = () => {
        pdf.setFillColor(79, 70, 229);
        pdf.rect(0, 0, ANCHO, 2.5, 'F');
    };

    const pie = () => {
        pdf.setDrawColor(220, 224, 232);
        pdf.setLineWidth(0.25);
        pdf.line(M, ALTO - PIE + 1.5, ANCHO - M, ALTO - PIE + 1.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(95, 102, 118);
        const lineas = pdf.splitTextToSize(_LATIN1(doc.aviso), util - 18);
        pdf.text(lineas, M, ALTO - PIE + 6);
        pdf.setTextColor(17, 24, 39);
    };

    const saltoSiHaceFalta = (alto) => {
        if (y + alto > ALTO - PIE - 2) {
            pie();
            pdf.addPage();
            pintarFranjaSuperior();
            y = 14;
            return true;
        }
        return false;
    };

    const parrafo = (texto, { tam = 9.5, negrita = false, antes = 0, despues = 1.4, x = M, ancho = util, color = [17, 24, 39] } = {}) => {
        pdf.setFont('helvetica', negrita ? 'bold' : 'normal');
        pdf.setFontSize(tam);
        pdf.setTextColor(...color);
        const lineas = pdf.splitTextToSize(_LATIN1(texto), ancho);
        const alto = lineas.length * tam * 0.42;
        y += antes;
        saltoSiHaceFalta(alto);
        pdf.setFont('helvetica', negrita ? 'bold' : 'normal');
        pdf.setFontSize(tam);
        pdf.setTextColor(...color);
        pdf.text(lineas, x, y + tam * 0.35);
        y += alto + despues;
    };

    const pintarGrafica = (g) => {
        if (!g || !Array.isArray(g.filas) || g.filas.length < 2) return;
        const altoTotal = 9 + g.filas.length * 6.5 + 3;
        y += 2;
        saltoSiHaceFalta(altoTotal);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.setTextColor(30, 41, 59);
        pdf.text(_LATIN1(g.titulo), M, y + 3.5);
        y += 7;
        const xBarra = M + 15;
        const anchoBarra = util - 48;
        for (const f of g.filas) {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.setTextColor(71, 85, 105);
            pdf.text(_LATIN1(f.etiqueta), M, y + 3.2);
            pdf.setFillColor(238, 240, 246);
            pdf.roundedRect(xBarra, y + 0.5, anchoBarra, 3.2, 1, 1, 'F');
            const pct = Math.max(0, Math.min(100, Number(f.pct) || 0));
            if (pct > 0) {
                pdf.setFillColor(79, 70, 229);
                pdf.roundedRect(xBarra, y + 0.5, (anchoBarra * pct) / 100, 3.2, 1, 1, 'F');
            }
            if (f.metaPct != null && f.metaPct > 0 && f.metaPct <= 100) {
                const xm = xBarra + (anchoBarra * Number(f.metaPct)) / 100;
                pdf.setDrawColor(17, 24, 39);
                pdf.setLineWidth(0.5);
                pdf.line(xm, y - 0.3, xm, y + 4.4);
            }
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.setTextColor(30, 41, 59);
            pdf.text(_LATIN1(f.valorTexto), ANCHO - M, y + 3.2, { align: 'right' });
            y += 6.2;
        }
        y += 2;
    };

    const pintarBloqueClinico = (b) => {
        const padX = 4.5;
        const padY = 3.5;
        const anchoTexto = util - padX * 2;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        const tituloLineas = pdf.splitTextToSize(_LATIN1(b.titulo), anchoTexto);
        let altoContenido = tituloLineas.length * 11 * 0.42 + 1.8;
        const items = b.lineas.map((l) => {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9.5);
            const ls = pdf.splitTextToSize(_LATIN1(l), anchoTexto);
            altoContenido += ls.length * 9.5 * 0.42 + 1.2;
            return ls;
        });
        const altoCaja = padY * 2 + altoContenido;
        // Si cabe entero en una página, dibujamos la tarjeta con fondo suave y borde izquierdo índigo
        if (altoCaja < ALTO - PIE - 24) {
            y += 2;
            saltoSiHaceFalta(altoCaja);
            pdf.setFillColor(246, 247, 255);
            pdf.roundedRect(M, y, util, altoCaja, 2, 2, 'F');
            pdf.setFillColor(79, 70, 229);
            pdf.rect(M, y, 1.3, altoCaja, 'F');
            let cy = y + padY;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.setTextColor(49, 46, 129);
            pdf.text(tituloLineas, M + padX, cy + 3.6);
            cy += tituloLineas.length * 11 * 0.42 + 1.8;
            for (const ls of items) {
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(9.5);
                pdf.setTextColor(30, 41, 59);
                pdf.text(ls, M + padX, cy + 3.2);
                cy += ls.length * 9.5 * 0.42 + 1.2;
            }
            y += altoCaja + 2;
            return;
        }
        parrafo(b.titulo, { tam: 11, negrita: true, antes: 2.5, despues: 1.5, color: [49, 46, 129] });
        for (const l of b.lineas) parrafo(l, { tam: 9.5, despues: 1.1 });
    };

    pintarFranjaSuperior();
    parrafo(doc.titulo, { tam: 16, negrita: true, despues: 0.8, color: [17, 24, 39] });
    parrafo(doc.subtitulo, { tam: 9.5, despues: 3, color: [95, 102, 118] });
    pdf.setDrawColor(220, 224, 232);
    pdf.setLineWidth(0.3);
    pdf.line(M, y, ANCHO - M, y);
    y += 3.5;

    const bloques = doc.bloques || [];
    const clinicos = bloques.filter((b) => b && b.lineas?.length && _IDS_CLINICOS.has(b.id));
    const datos = bloques.filter((b) => b && b.lineas?.length && !_IDS_CLINICOS.has(b.id));

    for (const b of clinicos) pintarBloqueClinico(b);
    for (const g of doc.graficas || []) pintarGrafica(g);
    for (const b of datos) {
        y += 1.5;
        saltoSiHaceFalta(14);
        pdf.setDrawColor(229, 232, 238);
        pdf.setLineWidth(0.25);
        pdf.line(M, y, ANCHO - M, y);
        y += 2;
        parrafo(b.titulo, { tam: 11, negrita: true, antes: 0.5, despues: 1.2, color: [30, 41, 59] });
        for (const l of b.lineas) parrafo(l, { tam: 9.5, despues: 1.0, color: [51, 65, 85] });
    }
    pie();

    const totalPaginas = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i += 1) {
        pdf.setPage(i);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(95, 102, 118);
        pdf.text(`${i} / ${totalPaginas}`, ANCHO - M, ALTO - PIE + 6, { align: 'right' });
    }
    return pdf.output('blob');
}

export const _paraPruebas = { _LATIN1 };
