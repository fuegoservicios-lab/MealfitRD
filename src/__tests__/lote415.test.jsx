// [P1-PLAN-LOTE-415 · 2026-09-27] «Escanear mi plato» desde el chat salía encerrada en la caja de escribir.
//
// El dueño (captura del iPhone): «cuando le doy a escanear plato aparece medio bugueado». La hoja salía a media
// altura, la barra de pestañas tapaba «Elegir de galería», la flecha ⌄ del chat quedaba ENCIMA y el chat no se
// oscurecía. Causa: el 411 montó las hojas dentro de `.input-wrapper`, y esa caja lleva `will-change: transform` y
// `backdrop-filter` —los dos la convierten en el bloque contenedor de todo `position: fixed` que cuelgue de ella: el
// `inset: 0` de la hoja medía la CAJA, no la pantalla— y `z-index: 10` sobre `sticky` —contexto de apilamiento: el
// 1000 de la hoja solo competía dentro de la caja y la barra de pestañas (100) la tapaba—. «Anotar comida» se veía
// bien porque su hoja ya iba a `document.body` (createPortal); la del escáner no. Un arreglo por causa:
//   · la hoja del escáner va a `document.body`, como su hermana: una hoja a pantalla completa no puede depender de
//     dónde la monten;
//   · el chat monta las dos FUERA de la caja: el portal mueve el DOM, pero React sigue propagando los eventos por el
//     árbol de componentes, y el `onPointerDownCapture` de la caja tomaba cada toque en la hoja por un toque en el
//     compositor (`composerPointerDownRef`, que decide si el chat baja al perder el foco).
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import ScanMealModal from '../components/dashboard/ScanMealModal';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('[415] la hoja del escáner no depende de dónde la monten', () => {
    it('se monta en document.body aunque la pongan dentro de una caja', () => {
        const { getByTestId } = render(
            <div data-testid="caja" style={{ willChange: 'transform' }}>
                <ScanMealModal isOpen onClose={vi.fn()} userId="u-1" />
            </div>
        );
        const titulo = document.getElementById('scan-meal-title');
        expect(titulo).not.toBeNull();
        expect(getByTestId('caja').contains(titulo)).toBe(false);
    });

    it('el chat monta las dos hojas FUERA de la caja de escribir', () => {
        const AGENT = read('src/pages/AgentPage.jsx');
        const cajaEnPantalla = AGENT.indexOf('{messages.length === 0 && renderInputArea(true)}');
        expect(cajaEnPantalla).toBeGreaterThan(AGENT.indexOf('const renderInputArea = (isCentered = false) => ('));
        for (const tipo of ['escanear', 'anotar']) {
            const montaje = AGENT.indexOf(`{hojaDeComida?.tipo === '${tipo}' && (`);
            expect(montaje, tipo).toBeGreaterThan(cajaEnPantalla);
        }
    });
});
