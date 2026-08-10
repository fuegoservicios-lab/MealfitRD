// [P1-WIZARD-FIELD-ROWS · 2026-08-10] «Mejora la estructura del diseño móvil del
// formulario» — el dueño lo pidió con una captura del paso «Tus Medidas».
//
// DOS DEFECTOS, y el segundo también estaba en escritorio:
//
// 1. DOS COLUMNAS EN UN TELÉFONO. La rejilla era `minmax(140px, 1fr)`, escrita para el
//    ancho de escritorio. En 390px deja columnas de 167px, y ahí no caben «Altura *» +
//    el selector CM/FT (98px) sin quedar pegados; «Cintura en cm (Opcional)» partía en
//    dos líneas; y en pies la fila se rompía en dos casillas de 75px. Ese mínimo de
//    140px nunca fue el ancho que el contenido necesita: era el que hacía falta para
//    que cupieran dos columnas.
//
// 2. CASILLAS DESALINEADAS DENTRO DE LA MISMA FILA. Una cabecera con selector de unidad
//    mide 50px y una de solo etiqueta ~20px, así que dos campos vecinos arrancaban su
//    casilla a alturas distintas — medido: Edad 46px más arriba que Pies/Pulg, en
//    escritorio también.
//
// jsdom no calcula layout, así que aquí no se mide la alineación: se vigila el CONTRATO
// ESTRUCTURAL que la produce (toda cabecera es una `.mf-field-head`, incluidas las que
// no llevan selector) y las reglas CSS que lo sostienen. La comprobación de píxeles se
// hizo con el navegador antes de cerrar: 6 casillas → 2 alturas de arranque en
// escritorio, 1 columna sin desbordes en 390px.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from './utils/test-utils';
import { QMeasurements } from '../components/assessment/questions/QMeasurements';

const CSS = fs.readFileSync(path.resolve(__dirname, '..', 'index.css'), 'utf-8');
const QSRC = fs.readFileSync(
    path.resolve(__dirname, '..', 'components', 'assessment', 'questions', 'QMeasurements.jsx'),
    'utf-8',
);
const qCode = QSRC.split('\n').filter((ln) => !ln.trim().startsWith('//') && !ln.trim().startsWith('*')).join('\n');

const montar = () => render(<QMeasurements onManualAdvance={vi.fn()} />, {
    customContext: { formData: {}, updateData: vi.fn() },
});

// Recorta un bloque de reglas CSS por su selector, para no aceptar como prueba una
// coincidencia que en realidad vive en otro sitio del archivo.
const bloque = (selector) => {
    const i = CSS.indexOf(selector);
    if (i === -1) return null;
    return CSS.slice(i, CSS.indexOf('}', i) + 1);
};

describe('[P1-WIZARD-FIELD-ROWS] cada campo es una fila con su cabecera', () => {
    it('todas las etiquetas del paso viven dentro de una cabecera de campo', () => {
        // Esto es lo que alinea las casillas: si alguien añade un campo suelto sin
        // cabecera, su casilla vuelve a arrancar 30px por encima de la del vecino.
        const { container } = montar();
        const etiquetas = [...container.querySelectorAll('label')];
        expect(etiquetas.length).toBeGreaterThanOrEqual(5);
        for (const l of etiquetas) {
            expect(
                l.closest('.mf-field-head'),
                `la etiqueta «${l.textContent.trim()}» está fuera de una .mf-field-head`,
            ).not.toBeNull();
        }
    });

    it('los campos con selector de unidad lo tienen DENTRO de su cabecera', () => {
        montar();
        for (const nombre of ['Unidad de altura', 'Unidad de peso']) {
            const grupo = screen.getByRole('group', { name: nombre });
            expect(grupo.closest('.mf-field-head'), `${nombre} fuera de su cabecera`).not.toBeNull();
        }
    });

    it('la rejilla ya no lleva el ancho mínimo clavado en el JSX', () => {
        // Un `style` inline no puede tener punto de quiebre; por eso el arreglo tuvo que
        // salir del JSX. Si vuelve, vuelven las dos columnas en el teléfono.
        expect(qCode).not.toMatch(/gridTemplateColumns[^\n]*minmax\(\s*140px/);
        expect((qCode.match(/className="mf-field-grid"/g) || []).length).toBe(2);
    });

    it('no le pasa a <Label> una prop que ese componente descarta', () => {
        // `Label` solo lee `children` y `htmlFor`: el `style={{margin:0}}` que había aquí
        // no llegaba al DOM y el margen que pretendía anular seguía subiendo la etiqueta
        // ~4px sobre el centro del selector. Un ajuste que no ajusta nada es peor que su
        // ausencia: parece resuelto.
        expect(qCode).not.toMatch(/<Label[^>]*\sstyle=/);
    });
});

describe('[P1-WIZARD-FIELD-ROWS] las reglas que sostienen la estructura', () => {
    it('la rejilla existe y se estrecha a una columna en pantalla pequeña', () => {
        expect(bloque('.mf-field-grid {')).toMatch(/repeat\(auto-fit,\s*minmax\(140px/);
        const estrecho = CSS.match(/@media\s*\(max-width:\s*560px\)\s*\{[\s\S]{0,220}?\n\}/);
        expect(estrecho, 'falta el punto de quiebre que colapsa la rejilla').toBeTruthy();
        expect(estrecho[0]).toMatch(/\.mf-field-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    });

    it('el piso de la cabecera solo aplica donde hay vecino con quien alinearse', () => {
        // En una sola columna nadie tiene vecino: ahí el piso de 50px sería aire perdido
        // sobre tres de los cinco campos. Por eso vive en el media query de escritorio.
        expect(bloque('.mf-field-head {')).not.toMatch(/min-height/);
        const ancho = CSS.match(/@media\s*\(min-width:\s*561px\)\s*\{[\s\S]{0,220}?\n\}/);
        expect(ancho, 'falta el piso de altura para la cabecera en multi-columna').toBeTruthy();
        expect(ancho[0]).toMatch(/\.mf-field-head\s*\{[^}]*min-height:\s*50px/);
    });

    it('la cabecera anula el margen propio de la etiqueta', () => {
        // `.label` (FormUI) trae 0.5rem de margen inferior. Como hijo de un flex centrado
        // ese margen la descentra respecto al selector de unidad.
        expect(bloque('.mf-field-head > label {')).toMatch(/margin-bottom:\s*0/);
    });
});
