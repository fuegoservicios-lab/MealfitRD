/**
 * [P1-CHAT-KEYBOARD-TABBAR · 2026-08-23] En el iPhone, al abrir el teclado en el chat del
 * Agente, la caja de escribir DESAPARECÍA: el chat reserva por dentro los 64 px de la
 * barra de pestañas (P1-CHAT-TABBAR-BACK) y esa barra es `position: fixed` — iOS la
 * recoloca justo encima del teclado, así que tapa exactamente la caja, y debajo queda
 * una franja negra. Captura del dueño, 2026-08-22 22:58.
 *
 * Con el teclado abierto no se navega: se escribe. Contrato:
 *  - el handler de visualViewport que ya calcula `--kb-inset` estampa `data-kb-open`
 *    en <html> mientras hay teclado (y lo quita al cerrarse / desmontar);
 *  - con `html[data-kb-open]` la barra de pestañas no se pinta;
 *  - y la caja de escribir deja de reservar los 64 px.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('[P1-CHAT-KEYBOARD-TABBAR] la barra de pestañas se esconde mientras hay teclado en el chat', () => {
    it('AgentPage estampa data-kb-open en <html> cuando el teclado está abierto y lo quita después', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf("setProperty('--kb-inset'");
        expect(i).toBeGreaterThan(0);
        const bloque = src.slice(i - 900, i + 900);
        // [P1-KB-VIEWPORT-MATH · 2026-08-23] El predicado es `abierto` (kb sin restar el
        // paneo), no el inset. Anclar a `offsetBottom > 0` era anclar el defecto.
        expect(bloque).toMatch(/toggleAttribute\('data-kb-open', abierto\)/);
        expect(src).toMatch(/removeAttribute\('data-kb-open'\)/);
    });

    it('el predicado del teclado NO resta el paneo de iOS en ninguna de las tres superficies', () => {
        // La resta como PREDICADO es el defecto de fondo: con iOS panéado del todo daba 0,
        // o sea «no hay teclado» con el teclado en pantalla. Como LONGITUD sí es correcta,
        // y por eso vive dentro del SSOT y no suelta por las páginas.
        const restaCruda = /innerHeight\s*-\s*vv\.height\s*-\s*vv\.offsetTop/;
        for (const f of ['pages/AgentPage.jsx', 'pages/Pantry.jsx', 'components/dashboard/HelpChatWidget.jsx']) {
            const src = read(f);
            expect(src, `${f} debe usar el SSOT utils/keyboardViewport`).toMatch(/medirTecladoDeVentana/);
            const codigo = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
            expect(codigo, `${f} volvió a restar vv.offsetTop para decidir si hay teclado`).not.toMatch(restaCruda);
        }
    });

    it('al abrirse el teclado no se arrastra al usuario que está leyendo más arriba', () => {
        const src = read('pages/AgentPage.jsx');
        // Contrato P2-CHAT-SCROLL-RACE: userScrolledUpRef manda sobre el autoscroll.
        expect(src).toMatch(/if \(abierto && !userScrolledUpRef\.current\)/);
        // scrollIntoView y no scrollTop: con la lista virtualizada el contenedor es
        // overflow:hidden y escribirle scrollTop no hace nada.
        const i = src.indexOf('if (abierto && !userScrolledUpRef.current)');
        expect(src.slice(i, i + 400)).toMatch(/scrollIntoView/);
    });

    it('la caja conserva su acabado con el teclado CERRADO (la regla base no se parte)', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('html[data-kb-open] .input-wrapper {');
        expect(i).toBeGreaterThan(0);
        const regla = src.slice(i, src.indexOf('}', i));
        // Bajo data-kb-open va SOLO el relleno; blur/borde/sombra/radio pertenecen a
        // la regla base o el composer los pierde el 99% del tiempo.
        for (const prop of ['backdrop-filter', 'border-top', 'box-shadow', 'border-radius']) {
            expect(regla, `${prop} no puede vivir bajo data-kb-open`).not.toContain(prop);
        }
        const base = src.slice(0, i);
        const j = base.lastIndexOf('.input-wrapper {');
        expect(base.slice(j)).toContain('backdrop-filter');
    });

    it('hay una re-medicion EN LA COLA tras el ultimo evento del viewport (el asiento)', () => {
        // [P2-CHAT-KB-ASIENTO · 2026-08-23] iOS emite resize/scroll DURANTE la animacion
        // del teclado y el ultimo evento puede llegar antes de que la geometria quede
        // firme; entonces --kb-inset se queda con un fotograma intermedio y nada lo
        // corrige, porque no hay mas eventos hasta que el teclado se cierre. Eso es lo
        // que se ve como «a veces se abre mal»: intermitente porque depende de donde
        // caiga el ultimo evento. El asiento re-mide tras 350 ms de silencio.
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('let asiento = null;');
        expect(i, 'falta el asiento: sin el, una medicion rancia se queda para siempre').toBeGreaterThan(0);
        const bloque = src.slice(i, i + 700);
        expect(bloque).toMatch(/setTimeout\(\(\) => \{ asiento = null; updateInputPosition\(\); \}, 350\)/);
        expect(bloque, 'el asiento anterior se cancela: si no, se acumulan timers por evento')
            .toMatch(/if \(asiento\) clearTimeout\(asiento\)/);
        // y se limpia al desmontar
        expect(src).toMatch(/return \(\) => \{\s*if \(asiento\) clearTimeout\(asiento\);/);
    });

    it('BottomTabBar: display none bajo html[data-kb-open]', () => {
        const css = read('components/dashboard/BottomTabBar.module.css');
        expect(css).toMatch(/:global\(html\[data-kb-open\]\) \.tabBar\s*\{\s*display:\s*none/);
    });

    it('el FOCO por si solo NO mueve la caja: la reserva cuelga del teclado, no del foco', () => {
        // [P1-CHAT-FOCO-NO-MUEVE · 2026-08-23] Habia una regla `.input-wrapper:focus-within`
        // que soltaba los 64 px de reserva al enfocar. Era una suposicion disfrazada de
        // mecanismo: hay foco SIN teclado (escritorio estrechado, vista movil de las
        // DevTools, iPad con teclado fisico), y ahi la barra de pestanas NO se esconde
        // -- solo lo hace con `data-kb-open`. Medido en un banco aislado: al enfocar, el
        // borde inferior de la caja pasaba de 851 a 915 con la barra en 868, o sea se
        // metia DEBAJO de ella. Sin la regla: 851 y 851.
        const src = read('pages/AgentPage.jsx');
        const reglas = src.split(/\r?\n/).filter((l) => /^\s*\.input-wrapper:focus-within\s*\{/.test(l));
        expect(reglas, 'la reserva no puede colgar del foco: cuelga de data-kb-open').toEqual([]);
    });

    it('la caja de escribir del chat deja de reservar los 64 px con el teclado abierto', () => {
        const src = read('pages/AgentPage.jsx');
        expect(src).toMatch(/html\[data-kb-open\] \.input-wrapper\s*\{[^}]*padding-bottom:\s*0\.8rem !important/);
    });
});
