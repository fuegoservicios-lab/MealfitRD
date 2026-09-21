// [P1-PLAN-LOTE-140 · 2026-09-20] El BINARIO mueve el chat con el teclado (modo de prueba: `/nativo`).
//
// El dueño: «procede a mover el chat desde el código nativo para igualar a Gemini». El binario captura el chat en tiras y
// UIKit las mueve con la curva y la duración EXACTAS del teclado; debajo, la página pone su layout final de golpe y
// contesta `listo`. Aquí: las piezas puras (utils/keyboardNative.js), el contrato del cableado (AgentPage.jsx) y el del
// binario (SceneDelegate.swift). Lección del 139: lo no medido en el teléfono se entrega APAGADO.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    CLAVE_NATIVO_SIN_CIERRE, CLAVE_TECLADO_NATIVO, LISTA_SIN_TOPE, MANEJADOR_NATIVO, NATIVO_AJUSTES,
    alternarCierreNativo, alternarTecladoNativo, binarioMueveElChat, desplazamientoDeLista, enviarAlNativo,
    geometriaParaNativo, nativoCubreElCierre, radioEnPx, tecladoNativoEncendido,
} from '../utils/keyboardNative';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const ap = leer('src/pages/AgentPage.jsx');
const swift = leer('ios/App/App/SceneDelegate.swift');
const conBinario = (postMessage = vi.fn()) => ({ webkit: { messageHandlers: { [MANEJADOR_NATIVO]: { postMessage } } } });

describe('lote 140 · el interruptor', () => {
    beforeEach(() => { localStorage.removeItem(CLAVE_TECLADO_NATIVO); localStorage.removeItem(CLAVE_NATIVO_SIN_CIERRE); });

    it('APAGADO por defecto, y encendido solo cuenta con un binario que lo sepa hacer', () => {
        expect(tecladoNativoEncendido(conBinario())).toBe(false);
        expect(alternarTecladoNativo()).toBe(true);
        expect(localStorage.getItem(CLAVE_TECLADO_NATIVO)).toBe('1');
        expect(tecladoNativoEncendido(conBinario())).toBe(true);
        expect(tecladoNativoEncendido({})).toBe(false);            // binario viejo: sin manejador no hay modo
        expect(tecladoNativoEncendido(null)).toBe(false);
        expect(alternarTecladoNativo()).toBe(false);
        expect(localStorage.getItem(CLAVE_TECLADO_NATIVO)).toBeNull();
    });

    it('el cierre se cubre salvo que se diga lo contrario (`/nativo cierre`)', () => {
        expect(nativoCubreElCierre()).toBe(true);
        expect(alternarCierreNativo()).toBe(false);
        expect(nativoCubreElCierre()).toBe(false);
        expect(alternarCierreNativo()).toBe(true);
        expect(localStorage.getItem(CLAVE_NATIVO_SIN_CIERRE)).toBeNull();
    });

    it('hablar con el binario nunca lanza: sin manejador, o si el manejador falla, devuelve false', () => {
        const postMessage = vi.fn();
        expect(binarioMueveElChat(conBinario())).toBe(true);
        expect(enviarAlNativo({ tipo: 'apagar' }, conBinario(postMessage))).toBe(true);
        expect(postMessage).toHaveBeenCalledWith({ tipo: 'apagar' });
        expect(enviarAlNativo({ tipo: 'apagar' }, {})).toBe(false);
        expect(enviarAlNativo({ tipo: 'apagar' }, conBinario(() => { throw new Error('x'); }))).toBe(false);
    });

    it('el nombre del manejador es el MISMO en el binario', () => {
        expect(swift).toContain(`static let nombre = "${MANEJADOR_NATIVO}"`);
    });
});

describe('lote 140 · la geometría que se manda al binario', () => {
    const base = {
        altoPantalla: 844, anchoPantalla: 390, cajaTop: 690, cabeceraBottom: 101, franjaAlto: 47,
        fichas: [{ x: 16, y: 53, w: 44, h: 44, r: '50%' }, { x: 330, y: 53, w: 44, h: 44, r: '22px' }],
        padCerrado: 86.6, padAbierto: 17.6,
        lista: { scrollHeight: 3000, scrollTop: 2400, clientHeight: 600, overflowY: 'auto' },
    };

    it('[medido: teclado 335, relleno 86,6 → 17,6] el binario recibe la reserva que la caja suelta, no el recorrido', () => {
        const g = geometriaParaNativo(base);
        expect(g).toMatchObject({ tipo: 'geometria', activo: true, abierto: false, cajaTop: 690, corte: 101, padDelta: 69 });
        expect(g.listaMax).toBe(LISTA_SIN_TOPE);                  // pegada al final: sube lo que suba la caja
        // quietas encima: la franja de la barra de estado y las dos fichas, con su radio en px
        expect(g.fijas).toEqual([
            { x: 0, y: 0, w: 390, h: 47, r: 0 },
            { x: 16, y: 53, w: 44, h: 44, r: 22 },
            { x: 330, y: 53, w: 44, h: 44, r: 22 },
        ]);
        expect(g).toMatchObject(NATIVO_AJUSTES);                   // lo afinable viaja en el mensaje: se ajusta por OTA
    });

    it('va en coordenadas de PANTALLA: el paneo del visual viewport se descuenta', () => {
        const g = geometriaParaNativo({ ...base, abierto: true, cajaTop: 450, vvOffsetTop: 30 });
        expect(g.cajaTop).toBe(420);
        expect(g.corte).toBe(71);
        expect(g.fijas[1].y).toBe(23);
        expect(g.fijas[0].y).toBe(0);                              // la franja es de la pantalla, no del documento
    });

    it('sin el relleno cerrado no se sabe el recorrido: `activo:false` (y con geometría no creíble, igual)', () => {
        expect(geometriaParaNativo({ ...base, padCerrado: 0 }).activo).toBe(false);
        expect(geometriaParaNativo({ ...base, cajaTop: 0 }).activo).toBe(false);
        expect(geometriaParaNativo({ ...base, cajaTop: 110 }).activo).toBe(false);       // la caja pegada a la cabecera
        expect(geometriaParaNativo({ ...base, altoPantalla: 0 }).activo).toBe(false);
        expect(geometriaParaNativo().activo).toBe(false);
    });

    it('con el cierre sin cubrir, la geometría ABIERTA dice «no cubras»; la cerrada sigue activa', () => {
        expect(geometriaParaNativo({ ...base, abierto: true, cajaTop: 430, cubreCierre: false }).activo).toBe(false);
        expect(geometriaParaNativo({ ...base, cubreCierre: false }).activo).toBe(true);
    });

    it('cuánto se desplaza la conversación junto a la caja', () => {
        const l = { scrollHeight: 3000, clientHeight: 600, overflowY: 'auto' };
        // abrir: pegada (o va a ir) → sin tope; leyendo arriba → quieta
        expect(desplazamientoDeLista({ ...l, scrollTop: 2400 })).toBe(LISTA_SIN_TOPE);
        expect(desplazamientoDeLista({ ...l, scrollTop: 900 })).toBe(0);
        expect(desplazamientoDeLista({ ...l, scrollTop: 900, vaAlFinal: true })).toBe(LISTA_SIN_TOPE);
        // cerrar: pegada → baja hasta agotar su scroll, no más (con 120 px de scroll no puede bajar 266)
        expect(desplazamientoDeLista({ ...l, abierto: true, scrollTop: 2400 })).toBe(2400);
        expect(desplazamientoDeLista({ scrollHeight: 720, clientHeight: 600, scrollTop: 120, abierto: true })).toBe(120);
        expect(desplazamientoDeLista({ ...l, abierto: true, scrollTop: 900 })).toBe(0);
        // no llena su ventana, o virtualizada: no se mueve
        expect(desplazamientoDeLista({ scrollHeight: 400, clientHeight: 600, scrollTop: 0, vaAlFinal: true })).toBe(0);
        expect(desplazamientoDeLista({ ...l, scrollTop: 2400, overflowY: 'hidden' })).toBe(0);
    });

    it('`border-radius: 50%` se computa como «50%»: el radio se resuelve contra el lado menor', () => {
        expect(radioEnPx('50%', 44, 44)).toBe(22);
        expect(radioEnPx('50%', 80, 40)).toBe(20);
        expect(radioEnPx('12px', 44, 44)).toBe(12);
        expect(radioEnPx('999px', 44, 44)).toBe(22);
        expect(radioEnPx('16px 8px', 44, 44)).toBe(16);
        expect(radioEnPx('', 44, 44)).toBe(0);
    });
});

describe('lote 140 · el cableado del chat', () => {
    it('al FOCO el chat no se mueve: manda la geometría y espera al binario (con plazo)', () => {
        const k = ap.indexOf('const alGanarElFoco = (e) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain('if (!e.sinNativo && esperarAperturaNativa(campo)) return;');
        expect(cuerpo.indexOf('esperarAperturaNativa(campo)')).toBeLessThan(cuerpo.indexOf('anticiparApertura(recordado);'));
        const e = ap.indexOf('const esperarAperturaNativa = (campo) => {');
        const espera = ap.slice(e, ap.indexOf('\n        };', e));
        expect(espera).toContain('if (!nativoEncendido()) return false;');
        expect(espera).toContain('if (!mandarGeometriaNativa(false)) return false;');
        expect(espera).toContain('alGanarElFoco({ target: campo, sinNativo: true });');
        expect(espera).toContain('}, NATIVO_ESPERA_ABRIR_MS);');
    });

    it('al BLUR tampoco: espera el `N-` del binario, y los retornos tempranos del blur siguen yendo antes', () => {
        const k = ap.indexOf('const alPerderElFoco = (e) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain('if (!e.deNativo && esperarCierreNativo()) return;');
        expect(cuerpo.indexOf('composerPointerDownRef.current')).toBeLessThan(cuerpo.indexOf('esperarCierreNativo()'));
        expect(cuerpo.indexOf('esperarCierreNativo()')).toBeLessThan(cuerpo.indexOf("removeAttribute('data-kb-open')"));
        const e = ap.indexOf('const esperarCierreNativo = () => {');
        const espera = ap.slice(e, ap.indexOf('\n        };', e));
        expect(espera).toContain('alPerderElFoco({ relatedTarget: null, deNativo: true });');
        expect(espera).toContain('}, NATIVO_ESPERA_CERRAR_MS);');
    });

    it('el aviso CUBIERTO coloca el layout final de golpe; sin cubrir, el camino de siempre sigue intacto', () => {
        const k = ap.indexOf('const alTecladoNativo = (e) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain('if (atenderCoberturaNativa(e.detail, aviso)) return;');
        expect(cuerpo.indexOf('atenderCoberturaNativa(')).toBeLessThan(cuerpo.indexOf('alPerderElFoco({ relatedTarget: null });'));
        expect(cuerpo.indexOf('atenderCoberturaNativa(')).toBeLessThan(cuerpo.indexOf('anticiparApertura(aviso.inset);'));
        const a = ap.indexOf('const atenderCoberturaNativa = (detalle, aviso) => {');
        const atender = ap.slice(a, ap.indexOf('\n        };', a));
        expect(atender).toContain('if (detalle?.cubierto !== true) {');
        // cubrió y nadie va a colocar nada (modo apagado entre medias): que retire la captura ya
        expect(atender).toContain("enviarAlNativo({ tipo: 'listo', id });");
    });

    it('bajo la captura NADA se anima: alto congelado, layout forzado, final de la lista sin scroll suave, y `listo` al asentarse', () => {
        const k = ap.indexOf('const abrirBajoCobertura = (contenedor, inset, id, veniaDelFoco) => {');
        const abrir = ap.slice(k, ap.indexOf('\n        };', k));
        expect(abrir.indexOf('congelarAlto(contenedor);')).toBeLessThan(abrir.indexOf("contenedor.style.setProperty('--kb-inset', `${inset}px`);"));
        expect(abrir).toContain("root.toggleAttribute('data-kb-scroll-lock', true);");
        expect(abrir).toContain('void contenedor.offsetHeight;');
        expect(abrir).toContain("lista.scrollTo({ top: lista.scrollHeight, behavior: 'instant' });");
        // «pegada» se mide con el layout CERRADO, antes de tocarlo
        expect(abrir.indexOf('const pegada =')).toBeLessThan(abrir.indexOf('congelarAlto(contenedor);'));
        expect(abrir).toContain('confirmarAlNativo(contenedor, id, true);');
        const c = ap.indexOf('const cerrarBajoCobertura = (contenedor, id) => {');
        const cerrar = ap.slice(c, ap.indexOf('\n        };', c));
        expect(cerrar).toContain("root.removeAttribute('data-kb-open');");
        expect(cerrar).toContain("contenedor.style.setProperty('--kb-inset', '0px');");
        expect(cerrar).toContain('confirmarAlNativo(contenedor, id, false);');
        const f = ap.indexOf('const confirmarAlNativo = (contenedor, id, abierto) => {');
        const confirmar = ap.slice(f, ap.indexOf('\n        };', f));
        // primero la geometría NUEVA, después `listo`: la cobertura siguiente ya la encuentra al día
        expect(confirmar.indexOf('mandarGeometriaNativa(abierto);')).toBeLessThan(confirmar.indexOf("enviarAlNativo({ tipo: 'listo', id });"));
        expect(confirmar).toContain('descongelarAlto(contenedor);');
        // y la barra de pestañas tampoco se anima en esos fotogramas
        expect(leer('src/components/dashboard/BottomTabBar.module.css')).toMatch(/:global\(html\[data-kb-sin-anim\]\) \.tabBar \{\s*transition: none !important;/);
    });

    it('el cierre del teclado al ENVIAR no se cubre: la conversación salta a anclar el mensaje, la captura enseñaría la de antes', () => {
        const i = ap.indexOf('const _tecladoVirtual = tecladoAbiertoRef.current || medirTecladoDeVentana(window).abierto;');
        const antes = ap.slice(i - 500, i);
        expect(antes).toContain('cierreSinCoberturaRef.current = true;');
        expect(antes).toContain("enviarAlNativo({ tipo: 'apagar' });");
        const e = ap.indexOf('const esperarCierreNativo = () => {');
        const espera = ap.slice(e, ap.indexOf('\n        };', e));
        expect(espera.indexOf('if (cierreSinCoberturaRef.current) {')).toBeLessThan(espera.indexOf('mandarGeometriaNativa(true)'));
        // y tras cada movimiento del teclado la geometría vuelve a estar al día (el «apagar» no es para siempre)
        const v = ap.indexOf('const alEvento = () => {');
        expect(ap.slice(v, v + 300)).toContain('refrescarGeometriaNativa();');
    });

    it('[medido en el arnés: 161 px del final tras una respuesta] con el modo nativo el final se trae DE GOLPE, antes de la captura', () => {
        expect(ap).toContain("if (opciones?.instantaneo && accion !== 'nada') { scrollToBottom(accion === 'forzar', 'instant'); return; }");
        expect(ap).toContain('alAbrirTecladoRef.current?.({ instantaneo: true });   // la conversación decide YA si va al final, y va de golpe');
        // sin el modo nativo, como siempre (contratos del lote 115)
        expect(ap).toContain("else if (accion === 'forzar') scrollToBottom(true, 'auto');");
    });

    it('al salir del chat el binario deja de cubrir, y `/nativo` solo existe en la app nativa', () => {
        expect(ap).toContain("if (isNativeApp() && binarioMueveElChat()) enviarAlNativo({ tipo: 'apagar' });");
        expect(ap).toContain('const ordenNativo = isNativeApp() ? /^\\/nativo( cierre)?$/.exec(textToSend.trim().toLowerCase()) : null;');
        expect(ap).toContain("toast.info(t('Esta prueba necesita la versión nueva de la app'));");
        expect(ap).toContain("if (!encendido) enviarAlNativo({ tipo: 'apagar' });");
    });
});

describe('lote 140 · el binario', () => {
    it('captura ANTES de avisar, y el aviso dice si cubrió (con su id y su motivo)', () => {
        const k = swift.indexOf('private func retransmitirTeclado(');
        const cuerpo = swift.slice(k, swift.indexOf('\n    }', k));
        expect(cuerpo.indexOf('cobertura.alAvisoDelTeclado(')).toBeLessThan(cuerpo.indexOf('evaluateJavaScript(js'));
        expect(cuerpo).toContain('cubierto:\\(cubierto),id:\\(resultado.id),motivo:');
        expect(cuerpo).toContain('UIResponder.keyboardAnimationCurveUserInfoKey');
    });

    it('las tiras se mueven con la curva del teclado, no reciben toques y se montan SIN animación', () => {
        expect(swift).toContain('UIView.AnimationOptions(rawValue: UInt(max(0, curva)) << 16).union([.beginFromCurrentState, .allowUserInteraction])');
        expect(swift).toContain('nueva.isUserInteractionEnabled = false');
        expect(swift).toContain('UIView.performWithoutAnimation {');
        expect(swift).toContain('webView.resizableSnapshotView(from: rectCaja');
    });

    it('una captura NUNCA se queda puesta: hay plazo, se retira al perder la escena, y un `listo` ajeno no retira nada', () => {
        expect(swift).toContain('DispatchQueue.main.asyncAfter(deadline: .now() + plazo)');
        expect(swift).toContain('func sceneWillResignActive(_ scene: UIScene) {\n        cobertura.retirarYa()');
        expect(swift).toContain('if id == idActual && capa != nil {');
        expect(swift).toContain('if animacionAcabada && paginaLista { retirar(fundido: geometria.fundidoMs / 1000) }');
    });

    it('sin geometría activa no cubre, y un cambio de teclado con el chat ya abierto tampoco', () => {
        expect(swift).toContain('guard geometria.activo else { return no("apagado") }');
        expect(swift).toContain('if geometria.abierto == quiereAbierto { return no("estado") }');
        // SIGUE sin retirar observadores de WebKit (contrato del lote 128): `visualViewport` tiene que seguir midiendo
        expect(swift).not.toContain('removeObserver');
    });

    it('el binario pide la cadencia completa de la pantalla para sus animaciones (ProMotion)', () => {
        expect(leer('ios/App/App/Info.plist')).toMatch(/<key>CADisableMinimumFrameDurationOnPhone<\/key>\s*<true\/>/);
    });
});
