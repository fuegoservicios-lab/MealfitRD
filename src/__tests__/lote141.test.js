// [P1-PLAN-LOTE-141 · 2026-09-20] Primer build con `/nativo` en el iPhone del dueño: «se medio buguea».
//
// Su sonda dice que la maquinaria funciona (`N+335·383c` cubierto, `nat+` en el mismo ms, `natOk` 46 ms después, sin paneo
// de iOS: S=0 sy=0), y su captura enseña el estado: la flecha de «ir al final» a la vista = chat en modo LIBRE. Ahí el
// ResizeObserver del contenedor (lote 115) sube la conversación lo que encoge la ventana, pero el 140 le decía al binario
// «la lista no se mueve» (solo miraba si estaba pegada al final): la captura la dejaba quieta, la página la subía 266 px
// debajo, y al fundirse la conversación entera saltaba. Además ese ajuste iba con scroll SUAVE (seguía en marcha al
// retirar la captura) y la flecha, que cuelga de la caja, viajaba en la tira equivocada.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LISTA_SIN_TOPE, geometriaParaNativo } from '../utils/keyboardNative';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const ap = leer('src/pages/AgentPage.jsx');

describe('lote 141 · la conversación se mueve según el MODO de scroll', () => {
    const base = {
        altoPantalla: 844, anchoPantalla: 390, cajaTop: 690, cabeceraBottom: 101, franjaAlto: 47, fichas: [],
        padCerrado: 86.6, padAbierto: 17.6,
    };

    it('[el caso del dueño] modo libre, lejos del final: la lista SUBE con la caja', () => {
        const lista = { scrollHeight: 3000, scrollTop: 900, clientHeight: 600, overflowY: 'auto', modo: 'free', vaAlFinal: false };
        expect(geometriaParaNativo({ ...base, lista }).listaMax).toBe(LISTA_SIN_TOPE);
        // y al cerrar baja con ella, hasta donde dé su scroll
        expect(geometriaParaNativo({ ...base, abierto: true, cajaTop: 430, lista }).listaMax).toBe(900);
    });

    it('anclada con la respuesta en curso: el mensaje enviado sigue arriba, la lista no se mueve', () => {
        const lista = { scrollHeight: 3000, scrollTop: 900, clientHeight: 600, overflowY: 'auto', modo: 'anchored', vaAlFinal: false };
        expect(geometriaParaNativo({ ...base, lista }).listaMax).toBe(0);
    });

    it('el chat le dice al binario su modo de scroll', () => {
        const k = ap.indexOf('const mandarGeometriaNativa = (abierto) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain('modo: scrollModeRef.current,');
    });

    it('la flecha de «ir al final» cuelga de la caja: viaja en la tira de la caja', () => {
        const k = ap.indexOf('const mandarGeometriaNativa = (abierto) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain("wrapper.querySelector('.jump-to-latest')");
        // sigue siendo hija de la caja (si alguien la saca de ahí, este selector deja de encontrarla)
        const r = ap.indexOf('const renderInputArea = (isCentered = false) => (');
        const j = ap.indexOf('className="jump-to-latest"');
        expect(j).toBeGreaterThan(r);
        expect(j - r).toBeLessThan(30000);
    });

    it('bajo la captura el ajuste del modo libre va DE GOLPE; sin ella, como siempre (contrato del lote 115)', () => {
        const k = ap.indexOf("} else if (delta !== 0 && document.documentElement.hasAttribute('data-kb-sin-anim')) {");
        expect(k).toBeGreaterThan(0);
        expect(ap.slice(k, k + 700)).toContain("el.scrollTo({ top: Math.max(0, el.scrollTop + delta), behavior: 'instant' });");
        expect(ap).toContain('el.scrollTop = Math.max(0, el.scrollTop + delta);');
    });
});
