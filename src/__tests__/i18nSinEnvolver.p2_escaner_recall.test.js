/**
 * [P2-I18N-ESCANER-RECALL · 2026-08-22] Lo que el escáner de «español sin envolver» no veía.
 *
 * El gap decía «394 literales españoles en posiciones que no inspecciona». Medido con AST:
 * **13 hallazgos, 12 fuera de alcance** y el único dentro es el nombre del plan en PayPal.
 * La cifra no se sostenía. El MECANISMO sí, y es lo que se prueba aquí:
 *
 *   · `pareceEspanol` exigía un diacrítico o una palabra funcional CON espacio. Su propio
 *     comentario afirmaba que esa rama «no cuesta nada en recall». Costaba 39: los rótulos
 *     del panel forense —«Calidad LLM», «Pausado», «Emergencia»— no llevan ninguna de las
 *     dos marcas, así que `History.jsx` reportaba CERO con 39 cadenas en español dentro.
 *
 *   · Las tuplas `['id', 'Rótulo', 'tipo']` no las alcanzaba ningún nodo: no son propiedad
 *     de objeto, ni atributo, ni return. Ahí vivían 28 de esos 39.
 *
 *   · El argumento de un `toast` envuelto (`msg || 'texto'`, `cond ? 'a' : 'b'`) y el
 *     `{'texto'}` como hijo de JSX pasaban de largo: el nodo anotado era la expresión
 *     entera, cuyo `textoLiteral` es null.
 *
 * La marca ancha se aplica SÓLO donde la posición ya es evidencia de copy. En un `return`
 * suelto o en texto JSX el riesgo de marcar una cadena inglesa como española no compensa —
 * y ese falso positivo es el caro, porque enseña a desconfiar del gate.
 */
import { describe, it, expect } from 'vitest';
import { detectarEnFuente, pareceEspanol, pareceEspanolEnPosicionFuerte }
    from '../../scripts/i18n-sin-envolver.mjs';

const textos = (src) => detectarEnFuente(src).map((h) => h.texto);

describe('pareceEspanolEnPosicionFuerte', () => {
    it('ve el español que no lleva tilde ni palabra funcional', () => {
        for (const s of ['Calidad LLM', 'Pausado', 'Emergencia', 'Edad', 'Completado']) {
            expect(pareceEspanol(s)).toBe(false);            // el estrecho no lo ve…
            expect(pareceEspanolEnPosicionFuerte(s)).toBe(true);  // …el ancho sí
        }
    });

    it('NO marca inglés como español', () => {
        // El falso positivo caro: enseña a desconfiar del gate.
        for (const s of ['Close menu', 'Settings', 'Loading', 'Save changes', 'Shopping list',
                         'Delete account', 'Your plan is ready', 'Advanced options']) {
            expect(pareceEspanolEnPosicionFuerte(s)).toBe(false);
        }
    });

    it('sigue descartando identificadores, rutas y siglas', () => {
        for (const s of ['SCREAMING_CASE', 'okButton', '/ruta/de/algo', 'https://x.y', 'BCAA', 'es-DO']) {
            expect(pareceEspanolEnPosicionFuerte(s)).toBe(false);
        }
    });
});

describe('detectarEnFuente — las posiciones que se le escapaban', () => {
    it('ve el rótulo dentro de una tupla [id, Rótulo, tipo]', () => {
        const src = `const G = { keys: [['recovery_attempts', 'Reintentos aplicados', 'int']] };`;
        expect(textos(src)).toContain('Reintentos aplicados');
    });

    it('NO confunde el TIPO ni el ID de la tupla con copy', () => {
        const src = `const G = { keys: [['recovery_attempts', 'Reintentos aplicados', 'int']] };`;
        const t = textos(src);
        expect(t).not.toContain('int');
        expect(t).not.toContain('recovery_attempts');
    });

    it('un array de frases sueltas NO dispara: el indicio es la estructura', () => {
        const src = `const X = ['Primera frase larga', 'Segunda frase larga'];`;
        expect(textos(src)).toEqual([]);
    });

    it('ve una tabla de rótulos sin tildes', () => {
        const src = `const L = { completed: 'Completado', cancelled: 'Cancelado' };`;
        const t = textos(src);
        expect(t).toContain('Completado');
        expect(t).toContain('Cancelado');
    });

    it('ve el fallback de un toast: `msg || \'texto\'`', () => {
        const src = `toast.error(data?.detail || 'No se pudo guardar el plan');`;
        expect(textos(src)).toContain('No se pudo guardar el plan');
    });

    it('ve las dos ramas de un toast ternario', () => {
        const src = `toast(ok ? 'Todo salió bien' : 'Algo falló al guardar');`;
        const t = textos(src);
        expect(t).toContain('Todo salió bien');
        expect(t).toContain('Algo falló al guardar');
    });

    it('ve un literal como hijo de JSX y sus formas envueltas', () => {
        expect(textos(`const C = () => <div>{'Sin resultados que mostrar'}</div>;`))
            .toContain('Sin resultados que mostrar');
        expect(textos(`const C = () => <div>{n ? 'Hay resultados' : 'No hay nada aquí'}</div>;`))
            .toContain('No hay nada aquí');
    });

    it('respeta `t()` en todas las formas nuevas', () => {
        // Por IDENTIDAD de nodo, no por texto: filtrar por texto convierte a
        // `t('<strong>Aviso:</strong>')` en un falso positivo.
        expect(textos(`const G = { keys: [['k', t('Reintentos aplicados'), 'int']] };`)).toEqual([]);
        expect(textos(`toast.error(d || t('No se pudo guardar el plan'));`)).toEqual([]);
        expect(textos(`const C = () => <div>{t('Sin resultados que mostrar')}</div>;`)).toEqual([]);
    });

    it('respeta el marcador de exención', () => {
        const src = `// [I18N-EXEMPT: SSOT canonico, se traduce al pintar]\n`
            + `const L = { completed: 'Completado', cancelled: 'Cancelado' };`;
        expect(textos(src)).toEqual([]);
    });
});
