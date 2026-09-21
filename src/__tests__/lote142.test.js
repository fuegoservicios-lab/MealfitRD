// [P1-PLAN-LOTE-142 · 2026-09-20] Con `/nativo`, la PÁGINA VIVA también viaja.
//
// El dueño, con el 141 en el iPhone (sonda: cubierto, `natOk` a los 12–18 ms, sin paneo): «mejor, pero sigue habiendo delay
// alrededor del entorno… cuando cierro y abro ocurren fallas visuales alrededor». Inherente a mover SOLO una captura: lo que
// la captura no tiene —la barra de pestañas al cerrar, los mensajes que asoman por arriba, el cursor, el velo de la
// cabecera— aparecía al RETIRARLA, con la animación ya acabada. Ahora el binario desplaza además el WebView entero con un
// transform animado en el mismo bloque (D = S − destino: coincide con las tiras en cada fotograma) y las tiras solo tapan el
// relevo (~40 ms). La cabecera, fija en pantalla, se esconde durante el viaje: encima están las fichas y el velo del binario.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    CLAVE_NATIVO_SIN_VIVO, MANEJADOR_NATIVO_VIVO, NATIVO_AJUSTES,
    alternarNativoVivo, binarioMueveLaPagina, colorRgb, geometriaParaNativo, nativoVivoElegido,
} from '../utils/keyboardNative';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const ap = leer('src/pages/AgentPage.jsx');
const swift = leer('ios/App/App/SceneDelegate.swift');

describe('lote 142 · las piezas puras', () => {
    beforeEach(() => localStorage.removeItem(CLAVE_NATIVO_SIN_VIVO));

    it('la página sabe ANTES del primer aviso si el binario mueve la página viva: un segundo manejador', () => {
        expect(binarioMueveLaPagina({ webkit: { messageHandlers: { [MANEJADOR_NATIVO_VIVO]: {} } } })).toBe(true);
        expect(binarioMueveLaPagina({ webkit: { messageHandlers: { mfTeclado: {} } } })).toBe(false);   // el binario del 140
        expect(binarioMueveLaPagina(null)).toBe(false);
        expect(swift).toContain(`static let nombreVivo = "${MANEJADOR_NATIVO_VIVO}"`);
        expect(swift).toContain('controlador.add(self, name: CoberturaDelTeclado.nombreVivo)');
    });

    it('vivo por defecto (si el binario sabe); `/nativo vivo` lo deja en solo capturas sin otro build', () => {
        expect(nativoVivoElegido()).toBe(true);
        expect(alternarNativoVivo()).toBe(false);
        expect(nativoVivoElegido()).toBe(false);
        expect(alternarNativoVivo()).toBe(true);
    });

    const base = {
        altoPantalla: 844, anchoPantalla: 390, cajaTop: 690, cabeceraBottom: 101, franjaAlto: 47, fichas: [],
        padCerrado: 86.6, padAbierto: 17.6, colorFondo: 'rgb(15, 23, 42)',
    };

    it('con `vivo`, al ABRIR la tira de la conversación empieza en la franja (tapa la zona de la cabecera); al cerrar, bajo ella', () => {
        const abrir = geometriaParaNativo({ ...base, vivo: true });
        expect(abrir).toMatchObject({ vivo: true, corte: 47, franja: 47, veloAlto: 101, velo: [15, 23, 42] });
        const cerrar = geometriaParaNativo({ ...base, vivo: true, abierto: true, cajaTop: 430 });
        expect(cerrar).toMatchObject({ vivo: true, corte: 101, veloAlto: 101 });
        expect(abrir).toMatchObject(NATIVO_AJUSTES);
    });

    it('sin `vivo` (binario del 140, o apagado a mano) la geometría es la del 141', () => {
        const g = geometriaParaNativo(base);
        expect(g).toMatchObject({ vivo: false, corte: 101, velo: null });
    });

    it('el color del velo sale del fondo computado', () => {
        expect(colorRgb('rgb(255, 255, 255)')).toEqual([255, 255, 255]);
        expect(colorRgb('rgba(15, 23, 42, 0.9)')).toEqual([15, 23, 42]);
        expect(colorRgb('transparent')).toBeNull();
        expect(colorRgb('')).toBeNull();
    });
});

describe('lote 142 · el chat durante el viaje', () => {
    it('la cabecera (y la sonda) se esconden mientras el WebView viaja, y al acabar se reponen y se dice `fin`', () => {
        expect(ap).toMatch(/html\[data-kb-vuelo\] \.mobile-chat-header,\s*html\[data-kb-vuelo\] pre\[data-mf-sonda\] \{\s*visibility: hidden !important;/);
        const k = ap.indexOf('const confirmarAlNativo = (contenedor, id, abierto, { vivo = false, mantener = false, ms = 0 } = {}) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain("root.setAttribute('data-kb-vuelo', '');");
        expect(cuerpo).toContain('}, Math.max(0, ms) + NATIVO_FIN_MARGEN_MS);');
        expect(cuerpo).toContain("enviarAlNativo({ tipo: 'listo', id, mantener });");
        const f = ap.indexOf('const acabarVueloNativo = (id) => {');
        const fin = ap.slice(f, ap.indexOf('\n        };', f));
        expect(fin.indexOf("root.removeAttribute('data-kb-vuelo');")).toBeLessThan(fin.indexOf("enviarAlNativo({ tipo: 'fin', id });"));
        // al salir del chat no queda la cabecera escondida
        expect(ap).toContain('acabarVueloNativo(null);');
    });

    it('solo hay viaje si el BINARIO dijo `vivo` en su aviso; y la vuelta del selector de fotos pide `mantener`', () => {
        expect(ap).toContain('const vuelo = { vivo: detalle.vivo === true, ms: aviso.ms };');
        expect(ap).toContain('confirmarAlNativo(contenedor, id, true, { ...vuelo, mantener: !veniaDelFoco });');
        expect(ap).toContain('vivo: binarioMueveLaPagina() && nativoVivoElegido(),');
    });

    it('la sonda viaja como pieza QUIETA (antes se movía con la captura de la conversación)', () => {
        expect(leer('src/utils/keyboardProbe.js')).toContain("caja.setAttribute('data-mf-sonda', '');");
        expect(ap).toContain("const sonda = document.querySelector('pre[data-mf-sonda]');");
    });
});

describe('lote 142 · el binario', () => {
    it('el WebView viaja en el MISMO bloque de animación que las tiras, y acaba en su sitio', () => {
        const k = swift.indexOf('private func animar(');
        const cuerpo = swift.slice(k, swift.indexOf('\n    }', k));
        expect(cuerpo).toContain('let pagina: WKWebView? = vivoCapturado ? webView : nil');
        expect(cuerpo).toContain('pagina?.transform = CGAffineTransform.identity');
        // el punto de partida: D = S − destino
        expect(swift).toContain('webView.transform = CGAffineTransform(translationX: 0, y: desplazada - destinoNuevo)');
    });

    it('SEGURO: toda salida deja el WebView en su sitio', () => {
        const k = swift.indexOf('private func retirar(fundido: Double) {');
        const cuerpo = swift.slice(k, swift.indexOf('\n    }', k));
        expect(cuerpo).toContain('webView.transform = CGAffineTransform.identity');
        expect(cuerpo.indexOf('webView.transform = CGAffineTransform.identity')).toBeLessThan(cuerpo.indexOf('guard let saliente = capa else { return }'));
        expect(swift).toContain('cobertura.asegurarEnSuSitio()');
        expect(swift).toContain('func sceneWillResignActive(_ scene: UIScene) {\n        cobertura.retirarYa()');
    });

    it('al `listo` se relevan las tiras (al abrir se queda la conversación); con `mantener` se quedan todas', () => {
        expect(swift).toContain('if !mantener && listaViajaEntera { relevarTiras() }');
        // la página viva se mueve de una pieza: con la lista quieta o a medio recorrido, las tiras se quedan (como en el 141)
        expect(swift).toContain('listaViajaEntera = abs(destinoLista - destino) < 0.5');
        expect(swift).toContain('if !destinoAbierto, let lista = tiraLista { reunidas.append(lista); tiraLista = nil }');
        // y lo último (fichas, velo) se va con `fin`, cuando la página ya repuso su cabecera
        expect(swift).toContain('} else if tipo == "fin" {');
    });

    it('la capa va justo ENCIMA de la raíz de la app: un modal presentado (el selector de fotos) no queda tapado', () => {
        expect(swift).toContain('if g.vivo { anfitrion.insertSubview(nueva, aboveSubview: raiz) } else { anfitrion.addSubview(nueva) }');
    });

    it('el aviso dice si hay viaje (`vivo`), detrás de los campos de siempre', () => {
        expect(swift).toContain("motivo:'\\(resultado.motivo)',vivo:\\(vivo)}}))");
        expect(swift).not.toContain('removeObserver');
    });
});
