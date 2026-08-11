/**
 * [P1-Z-SCALE · 2026-08-10] La escala de capas: su orden y su alcance.
 *
 * DE DÓNDE VIENE. Los z-index del producto eran números sueltos —80, 100, 860,
 * 1000, 1001, 1100, 1200, 1460, 9990, 9998, 9999 ×6, 10000, 99999 ×2, 100000—
 * cuyo orden nadie decidió: se fue formando. Costó P1-MODAL-OVER-DIALOG (un
 * modal a 1000 bajo la ventana a 9990: el botón parecía muerto).
 *
 * LO QUE LA ESCALA **NO** ARREGLA, y conviene saberlo antes de subir un número:
 * `DashboardLayout .container` lleva `isolation: isolate`, así que todo el
 * dashboard vive encerrado en el nivel 0. Los `99999` de dos modales de
 * Dashboard.jsx son los números más altos del código y no le ganan a nada de
 * fuera. Para superar a la ventana o a un cajón hay que PORTALIZAR, no subir el
 * número. Por eso este guard vigila solo la banda de raíz.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarEscala } from './utils/zLayers';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(AQUI, '..');
const ESCALA = cargarEscala();

describe('[P1-Z-SCALE] la escala existe y conserva su orden', () => {
    it('declara las dos familias', () => {
        for (const t of ['--z-under', '--z-content', '--z-raised', '--z-raised-2']) {
            expect(ESCALA[t], `falta el token local ${t}`).toBeDefined();
        }
        for (const t of ['--z-widget', '--z-dialog', '--z-modal', '--z-skip']) {
            expect(ESCALA[t], `falta el token de raíz ${t}`).toBeDefined();
        }
    });

    it('el orden de los peldaños es el que había antes de tokenizar', () => {
        // Esta secuencia ES la escala. Si alguien reordena dos tokens, cambia el
        // apilamiento de la app aunque ningún componente se haya tocado.
        const orden = [
            '--z-widget', '--z-handle', '--z-appbar', '--z-appbar-menu',
            '--z-cover', '--z-cover-top', '--z-drawer', '--z-dialog',
            '--z-sysbanner', '--z-modal', '--z-modal-over', '--z-modal-top', '--z-skip',
        ];
        for (let i = 1; i < orden.length; i += 1) {
            expect(
                ESCALA[orden[i]],
                `${orden[i]} debe quedar por encima de ${orden[i - 1]}`,
            ).toBeGreaterThan(ESCALA[orden[i - 1]]);
        }
    });

    it('los locales quedan por debajo de cualquier capa de raíz', () => {
        // Un token local que se cuele en la banda de raíz haría que algo pensado
        // para vivir dentro de una tarjeta compita con los modales.
        const maxLocal = Math.max(ESCALA['--z-content'], ESCALA['--z-raised'], ESCALA['--z-raised-2']);
        expect(maxLocal).toBeLessThan(ESCALA['--z-widget']);
    });

    it('el modal gana a la ventana, y el enlace de salto a todo', () => {
        // Las dos relaciones que ya costaron un defecto y una sesión.
        expect(ESCALA['--z-modal']).toBeGreaterThan(ESCALA['--z-dialog']);
        expect(ESCALA['--z-skip']).toBeGreaterThan(ESCALA['--z-modal-top']);
    });
});

describe('[P1-Z-SCALE] nadie inventa números altos por su cuenta', () => {
    /** Archivos ya migrados: los que compiten en la raíz. El guard se limita a
     *  ellos a propósito — los z-index locales (dentro de tarjetas y chips) son
     *  arbitrarios por definición y obligarlos a usar tokens sería ruido. */
    const MIGRADOS = [
        'components/dashboard/SettingsDialog.module.css',
        'components/dashboard/NotificationCenter.module.css',
        'components/dashboard/DiaryHistory.module.css',
        'components/dashboard/HelpChatWidget.module.css',
        'components/common/Modal.jsx',
        'components/common/EvaluarDeNuevoModal.jsx',
        'components/common/PantryConsentModal.jsx',
        'components/common/SkipLink.module.css',
        'components/IOSInstallPrompt.jsx',
        'components/layout/Header.module.css',
        'pages/Supermarket.module.css',
    ];

    it.each(MIGRADOS)('%s no vuelve a un número mágico alto', (rel) => {
        const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
        // ≥ 500 es la frontera de la banda de raíz. Por debajo puede haber
        // números locales legítimos dentro del mismo archivo.
        const magicos = [...src.matchAll(/z-?index:\s*'?\s*(\d{3,})/gi)]
            .map((m) => Number(m[1]))
            .filter((n) => n >= 500);
        expect(
            magicos,
            `\n${path.basename(rel)} declara un z-index alto a mano (${magicos.join(', ')}).\n`
            + 'Esta banda ya usa la escala: pon un token --z-* de index.css.\n'
            + 'Y si lo que buscas es ganarle a la ventana de Configuración desde DENTRO del\n'
            + 'dashboard, el número no te va a servir: `.container` tiene `isolation: isolate`\n'
            + 'y encierra todo. Lo que hace falta ahí es portalizar a <body>.\n',
        ).toEqual([]);
    });
});
