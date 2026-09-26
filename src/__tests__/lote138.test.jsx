// [P1-PLAN-LOTE-138 · 2026-09-20] El teclado del chat nativo: la coreografía con `transform` pasa a ser el modo por defecto.
//
// El dueño, con la sonda puesta y `/fluido` APAGADO: «aún no lo siento 100 % fluido y rápido el teclado cuando lo abro y
// selecciono una foto con él abierto. En la app de Gemini se siente muy pero muy fluido y rápido». Su captura mide:
//   +4891 N+308·383 · +4914 N-0·0 · +5015 N+335·400 (cont=597) · +5095 resize (cont=597: 80 ms CLAVADO) · +5485 altoFin
// Tres cosas: (1) animar `height` depende del hilo principal en cada fotograma — y ahí estaba la foto reduciéndose—;
// (2) el anuncio de paso (308) re-apuntaba la animación 124 ms después; (3) la miniatura no salía hasta acabar la preparación.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const controls = vi.hoisted(() => ({ llamadas: [] }));
vi.mock('../utils/chatImageProcessing', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        prepareChatImage: vi.fn((file) => {
            controls.llamadas.push(file.name);
            return Promise.resolve({ file, thumbDataUrl: `data:${file.name}` });
        }),
    };
});

import { useChatAttachments } from '../hooks/useChatAttachments';
import {
    CLAVE_COREOGRAFIA, COREO_ADELANTO, COREO_MS_MIN, KB_ANUNCIO_PARECIDO_PX,
    alternarCoreografia, coreografiaEncendida, duracionDeApertura, insetDeApertura,
} from '../utils/keyboardChoreography';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const ap = leer('src/pages/AgentPage.jsx');
const foto = (name) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });

describe('lote 138 → 139 · la coreografía vuelve a ser un modo de PRUEBA', () => {
    beforeEach(() => { localStorage.removeItem(CLAVE_COREOGRAFIA); localStorage.removeItem('mf_kb_coreografia'); });

    // El 138 la encendió por defecto sin medirla en el iPhone; la sonda del dueño (paquete 20260920-211937) enseñó lo que el
    // arnés no tiene: con el layout aún cerrado iOS PANEA la página 335 px (`sy=335 top=-335`), la caja sube dos veces
    // (`caja=174`) y salta a su sitio en el relevo (`caja=509`).
    it('[139] APAGADA por defecto; `/fluido` la enciende (guarda «1») y la apaga', () => {
        expect(coreografiaEncendida()).toBe(false);
        expect(alternarCoreografia()).toBe(true);
        expect(localStorage.getItem(CLAVE_COREOGRAFIA)).toBe('1');
        expect(alternarCoreografia()).toBe(false);
        expect(localStorage.getItem(CLAVE_COREOGRAFIA)).toBeNull();
    });

    it('[139] la llave cambió de nombre: ni el «1» del lote 131 ni haber pasado por el 138 la dejan encendida', () => {
        expect(CLAVE_COREOGRAFIA).toBe('mf_kb_coreografia_v2');
        localStorage.setItem('mf_kb_coreografia', '1');
        expect(coreografiaEncendida()).toBe(false);
    });

    it('al ABRIR el chat llega antes que el teclado; la duración nunca baja del mínimo ni inventa una', () => {
        expect(COREO_ADELANTO).toBeLessThan(1);
        expect(duracionDeApertura(383)).toBe(326);
        expect(duracionDeApertura(400)).toBe(340);
        expect(duracionDeApertura(100)).toBe(COREO_MS_MIN);
        expect(duracionDeApertura(0)).toBe(0);
        expect(duracionDeApertura(undefined)).toBe(0);
        // y en el baile: la apertura usa la adelantada (transform y relevo); el cierre, la del teclado entera
        const k = ap.indexOf('const abrirConCoreografia = (contenedor, inset, vaAlFinal) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain('const msApertura = duracionDeApertura(msVigente);');
        expect(cuerpo).toContain('moverPiezas(-recorrido, msApertura);');
        expect(cuerpo).toContain('msApertura + RELEVO_MARGEN_MS);');
        const c = ap.indexOf('const prepararCierreConCoreografia = () => {');
        expect(ap.slice(c, ap.indexOf('\n        };', c))).not.toContain('duracionDeApertura');
    });
});

describe('lote 138 · [cazado en el arnés al encenderla] el relevo no puede depender de un scroll suave', () => {
    it('la lista lleva `scroll-behavior: smooth`: fijar el final con `scrollTop =` no es inmediato (medido: 3958 → 3958)', () => {
        // Con el transform recién soltado, el contenido bajaba 266 px de golpe y volvía deslizándose. Medido tras el
        // arreglo: último mensaje 545,2 → 279,2 con el transform y 279,2 tras el relevo; la caja, 416,8 → 416,6.
        const k = ap.indexOf('const relevoDeApertura = (contenedor, lista, acompana) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain("lista.scrollTo({ top: lista.scrollHeight, behavior: 'instant' });");
        expect(cuerpo.indexOf('soltarPiezas();')).toBeLessThan(cuerpo.indexOf("behavior: 'instant'"));
        expect(ap).toContain("scrollBehavior: 'smooth',");   // si la lista deja de ser suave, este arreglo sobra: que se sepa
    });

    it('la caja conserva su capa entre aperturas: soltar las piezas devuelve el `will-change` que traían', () => {
        expect(ap).toContain("if (!coreo.willChangePrevio.has(el)) coreo.willChangePrevio.set(el, el.style.willChange || '');");
        expect(ap).toContain("el.style.willChange = coreo.willChangePrevio.get(el) || '';");
    });
});

describe('lote 138 · una apertura, UNA animación', () => {
    it('[medido] N+308 → N+335 al volver del selector: vale el alto firme recordado y el segundo aviso no re-apunta', () => {
        // 1.er aviso, teclado cerrado: el de paso (308) se parece al recordado (335) → 335
        expect(insetDeApertura({ anunciado: 308, recordado: 335, vigente: 0, abierto: false })).toBe(335);
        // 2.º aviso, 124 ms después, con la apertura en vuelo hacia 335 → 335 (el llamador lo ve igual y no hace nada)
        expect(insetDeApertura({ anunciado: 335, recordado: 335, vigente: 335, abierto: true, enApertura: true })).toBe(335);
    });

    it('sin alto recordado (primera vez) manda el anuncio, y en vuelo uno parecido NO re-apunta', () => {
        expect(insetDeApertura({ anunciado: 308, recordado: 0, abierto: false })).toBe(308);
        expect(insetDeApertura({ anunciado: 335, recordado: 308, vigente: 308, abierto: true, enApertura: true })).toBe(308);
    });

    it('un anuncio que NO se parece (otro teclado) se obedece siempre', () => {
        expect(insetDeApertura({ anunciado: 250, recordado: 335, abierto: false })).toBe(250);
        expect(insetDeApertura({ anunciado: 335 + KB_ANUNCIO_PARECIDO_PX + 1, recordado: 335, vigente: 335, abierto: true, enApertura: true }))
            .toBe(335 + KB_ANUNCIO_PARECIDO_PX + 1);
    });

    it('abierto y quieto (cambio al teclado de emojis): manda el anuncio aunque se parezca', () => {
        expect(insetDeApertura({ anunciado: 380, recordado: 335, vigente: 335, abierto: true, enApertura: false })).toBe(380);
    });

    it('el chat decide con esa función, y el alto de paso no se RECUERDA', () => {
        const k = ap.indexOf('const alTecladoNativo = (e) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain('aviso.inset = insetDeApertura({');
        expect(cuerpo).toContain("enApertura: abriendoRef.current || coreo.fase === 'abriendo',");
        expect(cuerpo).toContain('if (aviso.inset === anunciado && String(anunciado) !== safeLocalStorageGet(CLAVE_INSET_NATIVO, null))');
        expect(cuerpo.indexOf('aviso.inset = insetDeApertura({')).toBeLessThan(cuerpo.indexOf('anticiparApertura(aviso.inset);'));
    });
});

describe('lote 138 · la foto se ve al instante y su preparación no le quita el hilo al teclado', () => {
    beforeEach(() => {
        controls.llamadas.length = 0;
        vi.useFakeTimers();
        vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn((f) => `blob:${f.name}`), revokeObjectURL: vi.fn() });
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('sin aplazamiento todo sigue igual: la preparación arranca al añadir', () => {
        const { result } = renderHook(() => useChatAttachments());
        act(() => { result.current.addFiles([foto('a.jpg')]); });
        expect(controls.llamadas).toEqual(['a.jpg']);
    });

    it('con `prepararTrasMs` la miniatura existe YA (previewUrl) y la preparación espera', async () => {
        const { result } = renderHook(() => useChatAttachments());
        act(() => { result.current.addFiles([foto('a.jpg')], { prepararTrasMs: 650 }); });
        expect(result.current.attachments).toHaveLength(1);
        expect(result.current.attachments[0].previewUrl).toBe('blob:a.jpg');
        expect(result.current.attachments[0].status).toBe('preparing');
        expect(controls.llamadas).toEqual([]);
        await act(async () => { vi.advanceTimersByTime(649); });
        expect(controls.llamadas).toEqual([]);
        await act(async () => { vi.advanceTimersByTime(2); });
        expect(controls.llamadas).toEqual(['a.jpg']);
    });

    it('ENVIAR no espera el aplazamiento: `waitUntilSettled` adelanta la tanda', async () => {
        const { result } = renderHook(() => useChatAttachments());
        act(() => { result.current.addFiles([foto('a.jpg')], { prepararTrasMs: 650 }); });
        let listas = null;
        await act(async () => {
            result.current.waitUntilSettled().then((v) => { listas = v; });
            await vi.advanceTimersByTimeAsync(5);
        });
        expect(controls.llamadas).toEqual(['a.jpg']);          // adelantada: no esperó los 650 ms
        // la espera sondea cada 30 ms y lee el estado que React publica al salir de cada `act`
        for (let i = 0; i < 6 && !listas; i += 1) {
            await act(async () => { await vi.advanceTimersByTimeAsync(35); });
        }
        expect(listas?.map((i) => i.status)).toEqual(['ready']);
        // y el temporizador aplazado, al vencer, ya no repite nada
        await act(async () => { vi.advanceTimersByTime(1000); });
        expect(controls.llamadas).toEqual(['a.jpg']);
    });

    it('el chat solo aplaza cuando hay un teclado que reponer, y pinta la foto sin esperar a «ready»', () => {
        // [P1-PLAN-LOTE-360] aplaza solo si la foto se prepara en el hilo principal (sin worker), y en iOS la caja no pinta
        // la foto GRANDE mientras se prepara (WebKit la decodificaba en el hilo principal: 769 ms congelado) — lote360.test.js
        expect(ap).toContain('if (files?.length) addFiles(files, { prepararTrasMs: reopenKeyboardAfterAttachmentRef.current && !workerDeImagenDisponible() ? ESPERA_PREPARAR_FOTO_MS : 0 });');
        expect(ap).toContain('const ESPERA_PREPARAR_FOTO_MS = 650;');
        expect(ap).toContain('const srcVista = vistaPreviaDelAdjunto(item, { ios: _esIOS, rota: previewsRotas.has(item.id) });');
        expect(ap).toContain("decoding={item.thumbDataUrl ? 'sync' : 'async'}");
        expect(ap).toContain('onError={() => marcarPreviewRota(item.id)}');
        // el selector de la WEB (input file) no aplaza nada
        expect(ap).toContain('        addFiles(e.target.files);');
    });
});
