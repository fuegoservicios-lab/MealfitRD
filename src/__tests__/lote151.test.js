// [P1-PLAN-LOTE-151 · 2026-09-21] El sombreado del ratón con la forma del control.
//
// El dueño, con captura de «Marcas del súper»: «cuando le paso el mouse por encima el sombreado no es perfecto […]
// los bordes no son correctos, está estilo cuadrado y la figura del menú es estilo círculo».
//
// Causa: las tres variantes de `data-hover` (lote 144) pintan con SOMBRAS —el velo es `inset 0 0 0 999px` y el
// anillo `0 0 0 1px`— y una sombra sigue el `border-radius` DEL PROPIO elemento, no el de su contenedor. Un botón
// sin radio dentro de una tarjeta redondeada pinta un rectángulo que se sale por las esquinas. En «Marcas del
// súper» el contenedor ni siquiera puede recortarlo: lleva un aviso de 2026-07-02 de NO poner `overflow:hidden`
// porque se comería el popover absoluto del listado.
//
// Cuatro controles estaban así; el de la Nevera era el más visible, porque su gemelo «+» sí es un círculo.
// Este test es el ratchet: cualquier `data-hover` nuevo sin radio propio lo falla antes de llegar a producción.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(process.cwd(), 'src');

function ficheros(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === '__tests__' ? [] : ficheros(p);
        return /\.jsx?$/.test(e.name) ? [p] : [];
    });
}

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 151 · el velo del ratón tiene la forma del control', () => {
    it('todo `data-hover` declara su propio radio (o lo hereda de una clase / un estilo compartido)', () => {
        const sinRadio = [];
        for (const abs of ficheros(RAIZ)) {
            const texto = fs.readFileSync(abs, 'utf-8').replace(/\r\n/g, '\n');
            if (!texto.includes('data-hover=')) continue;
            const lineas = texto.split('\n');
            for (let i = 0; i < lineas.length; i++) {
                if (!lineas[i].includes('data-hover=')) continue;
                // el cuerpo de la etiqueta: hacia arriba hasta el `<Tag`, hacia abajo hasta el `>` que la cierra
                let ini = i;
                while (ini > 0 && !/<[A-Za-z]/.test(lineas[ini])) ini--;
                let fin = i;
                while (fin < lineas.length - 1 && !/^\s*\/?>/.test(lineas[fin])) fin++;
                const cuerpo = lineas.slice(ini, fin + 1).join('\n');
                if (/borderRadius|border-radius|className/.test(cuerpo)) continue;
                // `style={{ ...algo }}`: vale si ESE objeto lleva el radio
                const esparcidos = [...cuerpo.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
                const heredado = esparcidos.some((nombre) => {
                    const def = new RegExp(`const ${nombre}\\s*=\\s*\\{[\\s\\S]{0,600}?\\};`).exec(texto);
                    return def && /borderRadius/.test(def[0]);
                });
                if (!heredado) sinRadio.push(`${path.relative(RAIZ, abs).replace(/\\/g, '/')}:${i + 1}`);
            }
        }
        expect(sinRadio, 'un `data-hover` sin radio pinta el velo cuadrado sobre un control redondeado').toEqual([]);
    });

    it('el disparador de «Marcas del súper» usa el radio INTERIOR de su tarjeta', () => {
        const src = leer('src/components/dashboard/SupermarketBrands.jsx');
        // la tarjeta: 0,75rem y 1px de borde; el botón va por dentro, así que su radio es uno menos
        expect(src).toContain("borderRadius: '0.75rem',");
        expect(src).toContain("borderRadius: 'calc(0.75rem - 1px)',");
        // y sigue sin recortar: el popover del listado es absoluto (aviso de P3-BRANDS-POPOVER-NO-DEFORM)
        expect(src).toContain('SIN overflow:hidden');
    });

    it('el «−» de la Nevera es tan redondo como el «+» que tiene al lado', () => {
        const src = leer('src/pages/Pantry.jsx');
        const i = src.indexOf("aria-label={t('Disminuir cantidad')}");
        const j = src.indexOf("aria-label={t('Aumentar cantidad')}");
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
        expect(src.slice(src.lastIndexOf('<button', i), i)).toContain("borderRadius: '99px'");
        expect(src.slice(src.lastIndexOf('<button', j), j)).toContain("borderRadius: '99px'");
    });

    it('un botón lleno conserva SU resplandor: el hover lo suma con drop-shadow, no lo sustituye', () => {
        // «el sombreado al pasarle el mouse por encima a este botón no me gusta» (Reponer mi Nevera). La regla del
        // 144 pisaba con `!important` la sombra CIAN del botón y le ponía una negra, más un anillo de
        // `currentColor` — que en un botón lleno es el color del TEXTO, oscuro. `drop-shadow` vive en el `filter`:
        // se suma a la sombra propia y sigue la forma del botón.
        const css = leer('src/index.css');
        const i = css.indexOf('[data-hover="boton"]:not(:disabled):hover {');
        const regla = css.slice(i, css.indexOf('}', i));
        expect(regla).toContain('drop-shadow(');
        expect(regla).not.toContain('box-shadow');
        expect(regla).not.toContain('!important');
        expect(regla).not.toContain('currentColor');
        // y el botón de «Reponer mi Nevera» sigue teniendo resplandor propio que conservar
        const sn = leer('src/components/dashboard/StatusNotice.module.css');
        expect(sn).toContain('box-shadow: 0 8px 18px -8px color-mix(in srgb, var(--sn-tone) 80%, transparent);');
    });

    it('las tarjetas del paso 1 responden al ratón también ELEGIDAS y también en oscuro', () => {
        // «estos no tienen el sombreado al pasarle el mouse por encima» (paso 1 del formulario). Sí lo tenían:
        // era invisible. La sombra iba en NEGRO sobre fondo oscuro, y la tarjeta seleccionada no respondía porque
        // `.radioCard.checked` se declara DESPUÉS de `.radioCard:hover` con la misma especificidad y le ganaba.
        const css = leer('src/components/common/FormUI.module.css');
        expect(css).toContain('.radioCard.checked:not([aria-disabled]):hover {');
        // el hover se anuncia con el borde + una sombra TEÑIDA, que se ve en los dos temas
        const i = css.indexOf('.radioCard:not([aria-disabled]):hover {');
        const regla = css.slice(i, css.indexOf('}', i));
        expect(regla).toContain('border-color: color-mix(in srgb, var(--primary) 45%, var(--border));');
        expect(regla).toContain('var(--primary)');
        // y en oscuro ya SOLO se toca el fondo: repetir borde y sombra era lo que lo dejaba mudo
        const j = css.indexOf('[data-theme="dark"]) .radioCard:not(.checked):not([aria-disabled]):hover {');
        expect(j).toBeGreaterThan(-1);
        const oscuro = css.slice(j, css.indexOf('}', j));
        expect(oscuro).not.toContain('border-color');
        expect(oscuro).not.toContain('box-shadow');
        // ninguna sombra negra sobre las tarjetas: era el modo de fallo
        expect(css).not.toContain('box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);');
        // una tarjeta apagada NO reacciona: invitaría a un clic que no hace nada
        expect(css).not.toMatch(/\.radioCard:hover\s*\{/);
    });

    it('los dos botones del diálogo de confirmación declaran su variante', () => {
        const dlg = leer('src/components/common/ConfirmDialog.jsx');
        expect(dlg).toMatch(/data-hover="fila"\s+onClick=\{onCancel\}/);
        expect(dlg).toMatch(/data-hover="boton"\s+onClick=\{onConfirm\}/);
    });

    it('quien llega del contador puede saltar a lo que le falta', () => {
        // «¿por qué si todas las preguntas están seleccionadas no aparece el botón para saltar a la última?»:
        // `canSkip` miraba dos historias —haber avanzado más en ESTA visita, o tener ya un plan— y le faltaba la
        // suya: terminó la rama corta y enciende el plan, así que solo le faltan las preguntas que esa rama salta.
        const flow = leer('src/components/assessment/InteractiveAssessmentFlow.jsx');
        expect(flow).toContain('|| _traeLoDelContador;');
        expect(flow).toContain('findFirstIncompleteFieldFor(formData, TRACKING_REQUIRED_FIELDS) === null');
        expect(flow).toContain('!isGuest && !_isTracking');   // un invitado no; la rama corta tampoco
        // y el atajo sigue siendo seguro: el handler valida y te deja en el primer campo incompleto
        expect(flow).toContain('handleSkipToLastStep');
    });

    it('el CTA del formulario contesta al ratón y está menos brillante en reposo', () => {
        const btn = leer('src/components/assessment/questions/NextButton.jsx');
        expect(btn).toContain('data-hover="boton"');
        expect(btn).toContain("color-mix(in srgb, var(--primary-dark) 86%, #000)");
        expect(btn).toContain("color-mix(in srgb, var(--secondary-dark) 86%, #000)");
        expect(btn).not.toContain("linear-gradient(135deg, var(--primary-dark) 0%, var(--secondary-dark) 100%)");
    });

    it('los chats recientes usan la utilidad común, no un hover a mano invisible en oscuro', () => {
        const sb = leer('src/components/agent/SidebarRecientes.jsx');
        expect(sb).toContain('data-hover="fila"');
        expect(sb).not.toContain("e.currentTarget.style.background = 'var(--bg-muted)'");
    });

    it('un aviso del coach que llega con el chat abierto se ve sin recargar', () => {
        // Medido el 21-sep: el recordatorio del desayuno se guardó en el servidor a las 11:30 y el dueño tenía
        // delante un chat en blanco. La adopción del chat de hoy existía, pero corría UNA vez por montaje y la
        // lista de sesiones solo se pedía al abrir la página.
        const ap = leer('src/pages/AgentPage.jsx');
        expect(ap).toContain('const primeraVez = !adopcionDelDiaHechaRef.current;');
        expect(ap).toContain('if (primeraVez) terminarEsperaDelDia();');
        expect(ap).not.toContain('if (adopcionDelDiaHechaRef.current || !session?.user?.id) return;');
        expect(ap).toContain("document.addEventListener('visibilitychange', alVolverALaPestana);");
        // lo que impide robar una conversación en marcha son las condiciones, no el contador
        expect(ap).toContain('if (isTurnActiveRef.current) return null;');
        expect(ap).toContain('if (isTurnActiveRef.current) return;');
    });

    it('las tres variantes siguen pintando con sombras — que es POR QUÉ hace falta el radio', () => {
        const css = leer('src/index.css');
        expect(css).toContain('[data-hover="fila"]:not(:disabled):hover');
        expect(css).toMatch(/\[data-hover="fila"\]:not\(:disabled\):hover \{\s*\n\s*box-shadow: inset 0 0 0 999px/);
        expect(css).toMatch(/\[data-hover="icono"\]:not\(:disabled\):hover \{\s*\n\s*box-shadow: inset 0 0 0 999px/);
        // y ninguna mueve el botón: P2-HOVER-NO-MOTION sigue en pie
        expect(css).not.toMatch(/\[data-hover="boton"\]:not\(:disabled\):hover \{[^}]*translate/);
    });
});
