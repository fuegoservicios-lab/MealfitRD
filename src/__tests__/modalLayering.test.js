// [P1-MODAL-OVER-DIALOG · 2026-08-10] Un modal abierto DESDE la ventana de
// configuración tiene que dibujarse ENCIMA de ella.
//
// El defecto que ancla: el botón «Evaluar de nuevo» de Plan & Objetivo parecía
// no hacer nada. Sí hacía: el estado cambiaba y el modal se montaba — a
// `zIndex: 1000`, debajo del overlay de la ventana de Configuración
// (`z-index: 9990`) y de su backdrop `rgba(2,6,23,.62)` con blur. Un modal
// invisible detrás de una cortina opaca es indistinguible de un botón muerto.
//
// Por qué el autor de la ventana no lo vio: eligió 9990 A PROPÓSITO para quedar
// bajo el `Modal.jsx` común (9999) y dejar que sus confirmaciones se pintaran
// encima. La regla era correcta; solo cubría el modal COMPARTIDO. Los modales
// de un solo uso traen su propio número y se cayeron del razonamiento.
//
// Por eso el test mira la RELACIÓN entre capas, no un valor: mientras la
// relación se cumpla, cada quien puede cambiar su número.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zDeArchivo } from './utils/zLayers';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(AQUI, '..');

/** [P1-Z-SCALE · 2026-08-10] Resuelve el z-index aunque venga como token de la
 *  escala. Antes leía el número a mano y este guard se rompió el día que los
 *  z-index pasaron a `var(--z-*)`: afirmaba «no declara z-index» sobre archivos
 *  que sí lo declaraban. Un guard que no entiende la forma nueva del código no
 *  protege, estorba. */
const zDe = (rel) => zDeArchivo(path.join(SRC, rel));

const Z_DIALOGO = zDe('components/dashboard/SettingsDialog.module.css');

/** Modales que portalizan a <body> con su propio z-index en línea. No basta con
 *  los que HOY se abren desde Configuración: el coste de que uno nuevo caiga en
 *  la misma trampa es que parezca un botón roto, y eso ya costó una sesión. */
const MODALES_PORTAL = [
  'components/common/EvaluarDeNuevoModal.jsx',
  'components/common/PantryConsentModal.jsx',
  'components/common/Modal.jsx',
];

describe('[P1-MODAL-OVER-DIALOG] los modales se dibujan sobre la ventana de Configuración', () => {
  it('la ventana de Configuración declara su capa', () => {
    // Si esto es null, el resto del archivo pasaría por comparar contra nada.
    expect(Z_DIALOGO).toBeGreaterThan(0);
  });

  it.each(MODALES_PORTAL)('%s se pinta por encima', (rel) => {
    const z = zDe(rel);
    expect(z, `${rel} no declara z-index; el escáner no puede protegerlo`).toBeGreaterThan(0);
    expect(
      z,
      `\n${path.basename(rel)} usa z-index ${z} y la ventana de Configuración está en `
      + `${Z_DIALOGO}. Si este modal se abre desde ahí, se monta DEBAJO de su backdrop `
      + 'opaco: el usuario ve un botón que no hace nada.\n'
      + 'Súbelo por encima de la ventana, como hace Modal.jsx.\n',
    ).toBeGreaterThan(Z_DIALOGO);
  });
});
