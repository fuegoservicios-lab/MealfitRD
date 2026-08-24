/**
 * [P1-CHAT-KB-SCROLL-QUIETO + P1-CHAT-PICKER-ANCLADO + P1-CHAT-AIRE-INFERIOR · 2026-08-23]
 * Los tres defectos que el dueño reportó desde su iPhone con la app instalada
 * (captura de las 5:50):
 *
 *  1. El menú nativo de la foto («Fototeca / Tomar foto / Seleccionar archivo») salía
 *     flotando a media pantalla, despegado del clip. iOS lo ancla al RECTÁNGULO del
 *     `<input type="file">` que lo disparó, y el input estaba en `display: none`: sin
 *     caja no hay ancla.
 *  2. «Pregúntale a Bioboros» lamiendo el borde inferior: los 64 px de la reserva son
 *     la barra de pestañas, no aire propio de la caja.
 *  3. «Cuando scrolleo, el teclado no se queda pegado»: con el teclado abierto iOS
 *     panea durante el scroll, `layoutInset = kb − paneo` cambiaba en cada fotograma
 *     y el contenedor —y con él la caja— se movía.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { insetEstabilizado, KB_INSET_HISTERESIS_PX, medirTeclado } from '../utils/keyboardViewport';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('[P1-CHAT-KB-SCROLL-QUIETO] la caja no se mueve con el ruido del paneo', () => {
    it('la primera medición siempre se aplica (no hay anterior que conservar)', () => {
        expect(insetEstabilizado(null, 336, { abierto: true, estabaAbierto: false })).toBe(336);
        expect(insetEstabilizado(undefined, 120, { abierto: true, estabaAbierto: false })).toBe(120);
    });

    it('EL DEFECTO: el ruido del scroll (< umbral) NO mueve la caja', () => {
        const anterior = 336;
        for (const ruido of [1, 8, 23]) {
            expect(insetEstabilizado(anterior, anterior - ruido, { abierto: true, estabaAbierto: true }))
                .toBe(anterior);
        }
    });

    it('un cambio real (>= umbral) sí se aplica: no es un congelador', () => {
        expect(insetEstabilizado(336, 336 - KB_INSET_HISTERESIS_PX, { abierto: true, estabaAbierto: true }))
            .toBe(336 - KB_INSET_HISTERESIS_PX);
        expect(insetEstabilizado(336, 120, { abierto: true, estabaAbierto: true })).toBe(120);
    });

    it('abrir o cerrar el teclado NUNCA se ignora: es el evento, no ruido', () => {
        // se cierra con un delta pequeño respecto al anterior
        expect(insetEstabilizado(10, 0, { abierto: false, estabaAbierto: true })).toBe(0);
        // se abre
        expect(insetEstabilizado(0, 12, { abierto: true, estabaAbierto: false })).toBe(12);
    });

    it('con el teclado cerrado no hay nada que estabilizar', () => {
        expect(insetEstabilizado(300, 0, { abierto: false, estabaAbierto: false })).toBe(0);
    });

    it('`forzar` (el asiento tras 350 ms de silencio) salta la histéresis', () => {
        expect(insetEstabilizado(336, 330, { abierto: true, estabaAbierto: true })).toBe(336);
        expect(insetEstabilizado(336, 330, { abierto: true, estabaAbierto: true, forzar: true })).toBe(330);
    });

    it('valores basura no rompen ni devuelven negativos', () => {
        expect(insetEstabilizado(null, -50, { abierto: true, estabaAbierto: false })).toBe(0);
        expect(insetEstabilizado(null, NaN, { abierto: true, estabaAbierto: false })).toBe(0);
    });

    it('AgentPage aplica la histéresis y el asiento la fuerza', () => {
        const src = read('pages/AgentPage.jsx');
        expect(src).toMatch(/insetEstabilizado\(insetAplicadoRef\.current, posicion\.containerInset/);
        expect(src, 'el asiento debe forzar: si no, la última medida buena podría quedar ignorada')
            .toMatch(/asiento = null; updateInputPosition\(true\)/);
        // el valor aplicado es el que se escribe: escribir `layoutInset` a pelo
        // reintroduce el defecto sin cambiar de forma.
        expect(src).toMatch(/setProperty\('--kb-inset', `\$\{aplicado\}px`\)/);
    });
});

describe('[P1-CHAT-PICKER-ANCLADO] el menú de la foto sale del clip', () => {
    it('el input de fichero tiene caja (no display:none) y está superpuesto al botón', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('type="file"');
        expect(i).toBeGreaterThan(0);
        // Ventana hasta el CIERRE del input, no a los N chars: es la cuarta vez hoy
        // que un comentario nuevo desborda un tope fijo y pone rojo un guard sano.
        const bloque = src.slice(i, src.indexOf('/>', i));
        expect(bloque, 'sin rectángulo, iOS ancla el menú donde puede')
            .not.toMatch(/display:\s*'none'/);
        expect(bloque).toMatch(/position:\s*'absolute'/);
        expect(bloque).toMatch(/opacity:\s*0/);
        // el toque sigue siendo del botón
        expect(bloque).toMatch(/pointerEvents:\s*'none'/);
    });

    it('el input no es alcanzable por teclado ni por lector de pantalla (lo anuncia el botón)', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('type="file"');
        // Ventana hasta el CIERRE del input, no a los N chars: es la cuarta vez hoy
        // que un comentario nuevo desborda un tope fijo y pone rojo un guard sano.
        const bloque = src.slice(i, src.indexOf('/>', i));
        expect(bloque).toMatch(/aria-hidden="true"/);
        expect(bloque).toMatch(/tabIndex=\{-1\}/);
    });

    it('con teclado abierto espera al viewport real antes de abrir el menú nativo', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('const openAttachmentPicker');
        const bloque = src.slice(i, src.indexOf('\n    };', i));
        expect(bloque).toMatch(/await waitForAttachmentKeyboardClose\(shouldWait\)/);
        expect(bloque.indexOf('await waitForAttachmentKeyboardClose(shouldWait)'))
            .toBeLessThan(bloque.indexOf('fileInput.showPicker()'));
        expect(bloque).toMatch(/fileInput\.showPicker\(\)/);
        expect(bloque).toMatch(/fileInput\.click\(\)/);
        expect(src).not.toMatch(/--attachment-anchor-height/);
        expect(src).not.toMatch(/attachmentPickerLayoutLockRef/);
        expect(src).not.toMatch(/setProperty\('transition-duration', '0s'\)/);
    });

    it('inicia el cierre en pointerdown y exige 120 ms de viewport estable', () => {
        const src = read('pages/AgentPage.jsx');
        expect(src).toMatch(/onPointerDown=\{prepareAttachmentPickerGesture\}/);
        const i = src.indexOf('const waitForAttachmentKeyboardClose');
        const bloque = src.slice(i, src.indexOf('\n    };', i));
        expect(bloque).toMatch(/addEventListener\('resize', check\)/);
        expect(bloque).toMatch(/addEventListener\('scroll', check\)/);
        expect(bloque).toMatch(/setTimeout\(finish, 120\)/);
        expect(bloque).toMatch(/setTimeout\(finish, 1500\)/);
        expect(bloque).toMatch(/requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
    });

    it('evita aperturas dobles mientras espera el cierre', () => {
        const src = read('pages/AgentPage.jsx');
        expect(src).toMatch(/if \(attachmentPickerOpeningRef\.current\) return/);
        expect(src).toMatch(/attachmentPickerOpeningRef\.current = true/);
        expect(src).toMatch(/finally \{\s*attachmentPickerOpeningRef\.current = false/);
    });
});

describe('[P1-CHAT-AIRE-INFERIOR] la caja no lame el borde', () => {
    it('con teclado cerrado, el aire propio va por encima de 0.8rem', () => {
        const src = read('pages/AgentPage.jsx');
        const m = src.match(/padding: 0\.8rem 1\.25rem calc\((\d+(?:\.\d+)?)rem \+ 64px/);
        expect(m, 'no encontré el padding de .input-wrapper').toBeTruthy();
        expect(parseFloat(m[1])).toBeGreaterThan(0.8);
    });

    it('con teclado abierto también', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('html[data-kb-open] .input-wrapper {');
        expect(i).toBeGreaterThan(0);
        const regla = src.slice(i, src.indexOf('}', i));
        const m = regla.match(/padding-bottom:\s*(\d+(?:\.\d+)?)rem/);
        expect(m).toBeTruthy();
        expect(parseFloat(m[1])).toBeGreaterThan(0.8);
    });
});

describe('[P1-KB-PWA-FORM-ASSISTANT] el compositor queda sobre la barra de iOS', () => {
    it('resuelve una sola posición fija desde el primer evento abierto', () => {
        const src = read('pages/AgentPage.jsx');
        expect(src).toMatch(/resolverPosicionTeclado\(window, \{/);
        expect(src).toMatch(/translateY\(-\$\{posicion\.composerLift\}px\)/);
        expect(src).toMatch(/posicion\.containerInset/);
        expect(src).not.toMatch(/layoutInset \+ accesorioPwa/);
        expect(src).not.toMatch(/pwaTecladoAsentadoRef/);
    });
});

describe('[P1-KB-CIERRE-SIN-ESPERA] el cierre no espera a la animacion', () => {
    const src = read('pages/AgentPage.jsx');

    it('la perdida de foco quita data-kb-open sin esperar a la geometria', () => {
        expect(src).toMatch(/document\.addEventListener\('focusout', alPerderElFoco\)/);
        const i = src.indexOf('const alPerderElFoco');
        expect(i).toBeGreaterThan(0);
        const bloque = src.slice(i, src.indexOf('\n        };', i));
        expect(bloque).toMatch(/removeAttribute\('data-kb-open'\)/);
        expect(bloque).toMatch(/setProperty\('--kb-inset', '0px'\)/);
    });

    it('cambiar de un campo a otro NO cierra nada: el teclado sigue', () => {
        const i = src.indexOf('const alPerderElFoco');
        const bloque = src.slice(i, src.indexOf('\n        };', i));
        expect(bloque).toMatch(/relatedTarget/);
        expect(bloque).toMatch(/TEXTAREA/);
        expect(bloque).toMatch(/isContentEditable/);
        // el return temprano va ANTES de tocar el atributo, o el teclado parpadea
        expect(bloque.indexOf('return;')).toBeLessThan(bloque.indexOf("removeAttribute('data-kb-open')"));
    });

    it('el listener se retira al desmontar', () => {
        expect(src).toMatch(/removeEventListener\('focusout', alPerderElFoco\)/);
    });

    it('SOLO la contrapositiva: el foco nunca decide que HAY teclado', () => {
        // P1-CHAT-FOCO-NO-MUEVE: hay foco sin teclado (escritorio, DevTools, iPad con
        // teclado fisico). Poner el atributo desde un focusin resucita ese defecto.
        const codigo = src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
        expect(codigo).not.toMatch(/focusin[\s\S]{0,300}toggleAttribute\('data-kb-open', true\)/);
        expect(codigo).not.toMatch(/focusin[\s\S]{0,300}setAttribute\('data-kb-open'/);
    });
});

describe('[P1-KB-CERROJO-DE-CIERRE] el evento rezagado no vuelve a encoger el chat', () => {
    const src = read('pages/AgentPage.jsx');

    // La secuencia es la MEDIDA en el iPhone del dueño con la sonda (8:11), no inventada:
    // H no cambia nunca (Safari ignora interactive-widget: iOS panea), y tras el blur llega
    // un evento con la geometría vieja que encogía el contenedor otra vez.
    const H = 699;
    const EVENTOS = [
        { ev: 'scroll', vv: 362, S: 2 },
        { ev: 'scroll', vv: 362, S: 4 },
        { ev: 'blur', vv: 362, S: 4 },
        { ev: 'scroll', vv: 362, S: 0 },   // <- el rezagado
        { ev: 'resize', vv: 699, S: 0 },
        { ev: 'scroll', vv: 699, S: 0 },
    ];

    const reproducir = (conCerrojo) => {
        const altos = [];
        let cerrando = false;
        for (const { ev, vv, S } of EVENTOS) {
            if (ev === 'blur') {
                if (conCerrojo) cerrando = true;
                altos.push(H);
                continue;
            }
            const m = medirTeclado({ innerHeight: H, vvHeight: vv, vvOffsetTop: S });
            if (cerrando && !m.abierto) cerrando = false;
            const abierto = cerrando ? false : m.abierto;
            altos.push(H - (abierto ? m.layoutInset : 0));
        }
        return altos;
    };

    it('EL DEFECTO: sin cerrojo el contenedor hace 699 -> 362 -> 699 tras soltar el campo', () => {
        const altos = reproducir(false);
        // índices 2,3,4 = blur, scroll rezagado, resize
        expect(altos[2]).toBe(H);
        expect(altos[3], 'el evento rezagado vuelve a encoger: eso ES el retraso').toBeLessThan(H);
        expect(altos[4]).toBe(H);
    });

    it('con cerrojo, desde el blur ya no vuelve a encoger', () => {
        const altos = reproducir(true);
        expect(altos.slice(2)).toEqual([H, H, H, H]);
    });

    it('el cerrojo se libera solo cuando la geometría confirma: no atrapa el estado', () => {
        // Si el teclado NO se cierra (cambio de campo), el cerrojo no puede dejar el chat
        // creyendo que no hay teclado para siempre.
        let cerrando = true;
        const conTeclado = medirTeclado({ innerHeight: H, vvHeight: 362, vvOffsetTop: 0 });
        if (cerrando && !conTeclado.abierto) cerrando = false;
        expect(cerrando, 'con teclado en pantalla el cerrojo sigue armado').toBe(true);
        const sinTeclado = medirTeclado({ innerHeight: H, vvHeight: H, vvOffsetTop: 0 });
        if (cerrando && !sinTeclado.abierto) cerrando = false;
        expect(cerrando, 'al confirmarse el cierre el cerrojo se suelta').toBe(false);
    });

    it('el codigo cablea el cerrojo: blur lo arma y la medicion lo consulta', () => {
        expect(src).toMatch(/cerrandoRef\.current = true;/);
        expect(src).toMatch(/if \(cerrandoRef\.current && !abiertoMedido\) cerrandoRef\.current = false;/);
        expect(src).toMatch(/const abierto = cerrandoRef\.current \? false : abiertoMedido;/);
    });

    it('el asiento vuelve a programarse SIEMPRE', () => {
        // Se habia condicionado a `documentoEncoge`, y como Safari ignora
        // interactive-widget (H nunca cambia, medido), eso dejaba el camino real sin
        // ninguna re-medicion final.
        const i = src.indexOf('let asiento = null;');
        const bloque = src.slice(i, src.indexOf('\n        };', i));
        expect(bloque).not.toMatch(/documentoEncoge\) return/);
        expect(bloque).toMatch(/setTimeout\(/);
    });
});

describe('[P1-KB-BAJADA-FLUIDA] el chat acompaña al teclado en vez de saltar', () => {
    it('el contenedor anima su alto con la curva y duración del teclado de iOS', () => {
        const src = read('pages/AgentPage.jsx');
        expect(src).toMatch(/transition: isMobile \? 'height 0\.25s cubic-bezier\(0\.32, 0\.72, 0, 1\)' : undefined/);
    });

    it('solo en móvil: en escritorio el alto no se mueve y animarlo solo retrasaría', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf("transition: isMobile ? 'height");
        expect(i).toBeGreaterThan(0);
        expect(src.slice(i, src.indexOf('\n', i))).toContain(': undefined');
    });
});

describe('[P1-KB-HUECO-SIN-PINTAR] el fondo no delata el hueco durante el cierre', () => {
    const src = read('pages/AgentPage.jsx');

    it('mientras el chat esta en pantalla, el fondo de la pagina es el del chat', () => {
        // El body usa --bg-page (#0B1120) y el chat --bg-card (#111827): cualquier pixel
        // que el chat no cubra durante la animacion cambia de tono, y ESO es el parpadeo
        // que el dueno fotografio (8:51, fotograma intermedio del cierre).
        expect(src).toMatch(/html:has\(\.agent-route-active\),\s*\n\s*body:has\(\.agent-route-active\) \{\s*\n\s*background-color: var\(--bg-card\) !important;/);
    });

    it('la regla va ACOTADA con :has, no global: el resto del dashboard no cambia', () => {
        const i = src.indexOf('html:has(.agent-route-active)');
        expect(i).toBeGreaterThan(0);
        // dentro del bloque movil (donde vive el resto de reglas de esta pagina)
        const media = src.lastIndexOf('@media (max-width: 1024px) {', i);
        expect(media, 'la regla debe vivir dentro del @media movil').toBeGreaterThan(0);
    });
});

describe('[P2-CSS-EN-TEMPLATE-SIN-BACKTICKS] el CSS embebido no puede llevar backticks', () => {
    it('AgentPage parsea: un backtick en un comentario CSS cierra el template literal', () => {
        // Segunda vez que muerde. El CSS de esta pagina vive dentro de <style>{`...`}</style>,
        // o sea un template literal de JS: UN backtick en la prosa de un comentario CSS lo
        // cierra ahi mismo y el fichero deja de compilar. eslint lo caza, pero solo despues
        // de escribirlo; esto lo nombra para que la proxima vez se lea el porque.
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('<style>{`');
        expect(i, 'no encontre el bloque <style> embebido').toBeGreaterThan(0);
        const fin = src.indexOf('`}</style>', i);
        expect(fin).toBeGreaterThan(i);
        const css = src.slice(i + '<style>{`'.length, fin);
        expect(css.includes('`'), 'hay un backtick dentro del CSS embebido').toBe(false);
    });
});

describe('[P1-KB-SIN-DESENFOQUE] nada que Safari tenga que recomponer mientras se mueve', () => {
    it('la caja de escribir movil no lleva backdrop-filter', () => {
        // Su fondo es opaco (--bg-card): el desenfoque no pintaba un solo pixel visible y
        // en cambio obligaba a recomponer una capa en cada fotograma del cierre. Eso en iOS
        // se ve como la caja a medio pintar (captura del dueno, 8:51).
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('html[data-kb-open] .input-wrapper {');
        const base = src.slice(src.lastIndexOf('.input-wrapper {', i), i);
        expect(base).not.toMatch(/backdrop-filter:\s*blur/);
    });

    it('la barra de pestanas tampoco: fondo solido', () => {
        const css = read('components/dashboard/BottomTabBar.module.css');
        expect(css).not.toMatch(/backdrop-filter/);
        // y sin alfa: lo que se transparentaba era el fondo de pagina, que ya es del mismo
        // color, asi que el efecto no se distinguia ni con la barra quieta.
        expect(css).not.toMatch(/background:\s*rgba\([^)]*0\.9\d\)/);
    });
});
