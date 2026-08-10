// [P1-PANTRY-ROW-REFLOW · 2026-08-10] Grupo 6 de la auditoría de listo-para-tienda: la
// fila de la Nevera era la más pequeña y más apretada de toda la app.
//
// Un solo defecto con tres caras, y las tres se arreglan con el mismo reflow:
//
//   TAMAÑO — botón menos 27×22, botón más 27×22, papelera 22×21, input 56×21,
//     select 77×23. El peor caso (la papelera, 21px) era el 47,7 % del mínimo de
//     Apple y el 43,8 % del de Material. Nada de esto cambiaba entre 320 y 430px:
//     no era un problema responsive, era `padding: '2px 6px'` sobre iconos de 13px.
//
//   ANCHO — a 320px la fila mide 296px; los controles fijos más los huecos consumían
//     247,4 de los 270,4px de contenido, dejando ~23px para el nombre del alimento.
//     Completamente elipsado: el usuario no podía ver sobre qué fila actuaba.
//
//   TIPOGRAFÍA — el select de envase a 0,8rem = 12,8px, el control más pequeño de
//     todo el formulario.
//
// POR QUÉ ESTE TEST ES ESTRUCTURAL Y NO DE COMPORTAMIENTO, dicho sin adornos: este
// paso solo existe para cuentas autenticadas en modo Nevera, así que la auditoría —que
// corrió como invitado— no pudo recorrerlo en la app viva, y montarlo aquí exigiría
// simular sesión, catálogo, inventario y cuatro endpoints. Las medidas de arriba salen
// de descomponer el CSS y reproducir el markup, no de ver la pantalla funcionando.
// Lo que este test garantiza es que las decisiones no se deshagan en silencio; NO
// sustituye a mirarla en un teléfono con una cuenta real.
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const SRC = fs.readFileSync('src/components/assessment/questions/QPantryBuilder.jsx', 'utf-8');

const fila = () => {
    const m = SRC.match(/\{inventory\.map\(item => \([\s\S]*?\n {20}\)\)\}/);
    expect(m).toBeTruthy();
    return m[0];
};

describe('[P1-PANTRY-ROW-REFLOW] la fila deja de exprimir el nombre', () => {
    it('la fila puede partirse en dos líneas', () => {
        // Sin esto, el nombre es la única columna elástica y paga TODO el recorte.
        expect(fila()).toMatch(/flexWrap:\s*'wrap'/);
    });

    it('el nombre tiene un ancho mínimo real, no cero', () => {
        // `minWidth: 0` es lo que le permitía encogerse hasta desaparecer.
        const f = fila();
        expect(f).toMatch(/minWidth:\s*'9rem'/);
        expect(f).not.toMatch(/flex:\s*1,\s*minWidth:\s*0/);
    });

    it('los controles viajan juntos: bajan enteros o no bajan', () => {
        // Si se partieran, la segunda línea quedaría con un botón suelto y el usuario
        // perdería la relación entre el − , la cantidad y el +.
        expect(fila()).toMatch(/marginLeft:\s*'auto'/);
    });
});

describe('[P1-PANTRY-ROW-REFLOW] los cinco controles son tocables', () => {
    it('ningún control de la fila queda por debajo del mínimo', () => {
        const f = fila();
        // 3 botones + input + select = 5 controles con altura mínima declarada.
        const alturas = f.match(/minHeight:\s*44/g) || [];
        expect(alturas.length).toBeGreaterThanOrEqual(5);
    });

    it('los tres botones tienen además ancho mínimo (son iconos, no texto)', () => {
        const anchos = fila().match(/minWidth:\s*44/g) || [];
        expect(anchos.length).toBeGreaterThanOrEqual(3);
    });

    it('no queda ningún relleno de dos píxeles simulando un botón', () => {
        // Es la firma del defecto: `padding: '2px 6px'` sobre un icono de 13px.
        expect(fila()).not.toMatch(/padding:\s*'2px 6px'/);
    });
});

describe('[P1-PANTRY-ROW-REFLOW] la tipografía sube DESPUÉS del reflow', () => {
    it('el select de envase deja de ser el control más pequeño del formulario', () => {
        // Era 0.8rem = 12,8px. El orden importó: subirlo sobre la fila anterior la
        // habría reventado, porque el ancho ya estaba agotado.
        const f = fila();
        expect(f).not.toMatch(/fontSize:\s*'0\.8rem'/);
        expect(f).not.toMatch(/fontSize:\s*'0\.85rem'/);
    });

    it('nada dentro de la fila baja de 0,95rem', () => {
        const tamanos = (fila().match(/fontSize:\s*'([\d.]+)rem'/g) || [])
            .map((t) => parseFloat(t.match(/([\d.]+)rem/)[1]));
        expect(tamanos.length).toBeGreaterThan(0);
        for (const t of tamanos) expect(t).toBeGreaterThanOrEqual(0.95);
    });
});
