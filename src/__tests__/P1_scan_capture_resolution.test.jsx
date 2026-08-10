// [P1-SCAN-CAPTURE-RES · 2026-08-10] El escáner mandaba 0,3 megapíxeles.
//
// CÓMO SE ENCONTRÓ: el dueño preguntó si convenía subir a un modelo mayor (Sol) o
// a `reasoning_effort=medium` para que la visión dejara de confundir un pan de agua
// con uno de hot dog. Mirando los logs de producción antes de opinar, TODOS los
// scans llegaban con `original_wh=(480, 640)` y `resized=False` — es decir, la foto
// ya cabía de sobra bajo el tope de 1024px y el resize del servidor, escrito para
// ahorrar, nunca llegaba a actuar.
//
// La causa: `getUserMedia` se pedía solo con `facingMode`. La resolución hay que
// PEDIRLA; sin pedirla el navegador entrega su default, que es VGA. Un teléfono de
// 12 MP mandando 0,3.
//
// POR QUÉ ESTO ANTES QUE EL MODELO: razonar más no arregla mirar poco. El effort
// ayuda a inferir en varios pasos, no a percibir detalle que no está en los píxeles;
// y `medium` DOBLA la espera (8,2s → 16,5s medidos contra la API real en agent.py)
// en una pantalla donde el usuario está con el teléfono en la mano.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
    path.resolve(__dirname, '..', 'components', 'pantry', 'PantryScanButton.jsx'),
    'utf-8',
);

describe('[P1-SCAN-CAPTURE-RES] la cámara del escáner pide resolución', () => {
    const constraints = SRC.slice(
        SRC.indexOf('navigator.mediaDevices.getUserMedia({'),
        SRC.indexOf('}).then((stream)'),
    );

    it('pide una resolución explícita, no la que el navegador quiera dar', () => {
        expect(constraints).toBeTruthy();
        const ancho = constraints.match(/width:\s*\{\s*ideal:\s*(\d+)/);
        expect(ancho, 'sin `width` en las constraints vuelve el default VGA de 640x480').toBeTruthy();
        expect(Number(ancho[1])).toBeGreaterThanOrEqual(1280);
    });

    it('usa `ideal`, nunca `exact`: un móvil que no llegue debe seguir pudiendo escanear', () => {
        expect(constraints).not.toMatch(/exact:\s*\d/);
    });

    it('el recorte aguas abajo sigue acotando el payload', () => {
        // La nitidez sube; el tamaño no. Si alguien quita el tope, el scan pasa a
        // subir la foto entera del teléfono desde un móvil con datos.
        expect(SRC).toMatch(/_downscaleToB64\s*=\s*\(file,\s*maxSide\s*=\s*1024\)/);
    });
});
