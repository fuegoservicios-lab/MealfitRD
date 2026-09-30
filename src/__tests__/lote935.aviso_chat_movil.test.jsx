/**
 * [P1-PLAN-LOTE-935 · 2026-09-30] En el teléfono, el aviso «El coach es una IA…» no vive bajo la caja de escribir.
 *
 * El dueño (30-sep): «en móvil no lo quiero donde está, ya que irrumpe con el teclado». Bajo la caja, cada vez que se
 * abre el teclado el aviso sube con ella y roba una línea al chat. El aviso sigue siendo obligatorio y fijo (Apple
 * 1.4.1, lote 846): en el teléfono pasa al centro de la franja de cabecera, donde el rótulo «Bioboros 1» ya no se
 * muestra (está oculto en móvil desde la limpieza de la cabecera), y la línea de abajo se oculta SOLO en móvil. En
 * escritorio nada cambia.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
const leer = (rel) => readFileSync(resolve(SRC, rel), 'utf8').split(String.fromCharCode(13)).join('');
const TEXTO = "t('El coach es una IA y puede equivocarse.')";

describe('[P1-PLAN-LOTE-935] el aviso del coach, en móvil, en la cabecera y no bajo el teclado', () => {
    const src = leer('pages/AgentPage.jsx');
    const iMedia = src.indexOf('@media (max-width: 1024px) {');
    const bloqueMovil = src.slice(iMedia, src.indexOf('.agent-header-title { display: none !important; }', iMedia) + 400);

    it('la cabecera lleva el aviso corto, centrado como el rótulo que sustituye', () => {
        const iHeader = src.indexOf('className="mobile-chat-header"');
        const iTitulo = src.indexOf('className="agent-header-title"', iHeader);
        const cabecera = src.slice(iHeader, iTitulo + 3000);
        const i = cabecera.indexOf('className="chat-aviso-ia-cabecera"');
        expect(i).toBeGreaterThan(-1);
        expect(cabecera.slice(i, i + 900)).toContain(TEXTO);
        // 12 px de piso y el gris con información, como el aviso de abajo
        expect(cabecera.slice(i, i + 900)).toMatch(/fontSize: '0\.75rem'[\s\S]*color: 'var\(--text-muted\)'/);
    });

    it('en escritorio el aviso de la cabecera no se muestra; en móvil sí, y el de abajo se oculta', () => {
        expect(iMedia).toBeGreaterThan(-1);
        // fuera del bloque móvil: oculto
        const antes = src.slice(0, iMedia);
        expect(antes).toMatch(/\.chat-aviso-ia-cabecera \{ display: none; \}/);
        // dentro del bloque móvil: la cabecera lo muestra y la línea de abajo desaparece
        expect(bloqueMovil).toMatch(/\.chat-aviso-ia-cabecera \{ display: block !important; \}/);
        expect(bloqueMovil).toMatch(/\.chat-aviso-ia \{ display: none !important; \}/);
    });

    it('el aviso largo de abajo sigue tal cual (el test del 846 lo vigila): esto solo cambia dónde se ve en móvil', () => {
        expect(src).toContain("t('El coach es una IA: puede equivocarse y no sustituye el consejo médico.')");
    });
});
