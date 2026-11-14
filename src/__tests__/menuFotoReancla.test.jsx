// [MENU-FOTO-REANCLA · 2026-11-14] Teclado abierto → «Escanear mi plato»: el menú se anclaba al «+» medido con el
// teclado arriba y, al bajar el teclado, quedaba flotando a media pantalla. Ahora sigue al «+».
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AttachmentSourceSheet } from '../components/agent/AttachmentSourceSheet';

vi.mock('../i18n', () => ({ useT: () => (s) => s }));

afterEach(() => { vi.useRealTimers(); });

const rect = (top, left = 24) => ({ top, left, width: 40, height: 40, bottom: top + 40, right: left + 40 });

describe('menú de foto anclado al «+»', () => {
    it('se vuelve a colocar cuando el «+» se mueve al bajar el teclado', () => {
        vi.useFakeTimers();
        let actual = rect(400);   // teclado abierto: el «+» está a media pantalla
        const triggerRef = { current: { getBoundingClientRect: () => actual } };
        render(
            <AttachmentSourceSheet open onClose={() => {}} onGallery={() => {}} onCamera={() => {}}
                triggerRef={triggerRef} anchorRect={rect(400)} />,
        );
        const menu = screen.getByRole('dialog');
        const altura = window.innerHeight;
        expect(menu.style.bottom).toBe(`${altura - 400 + 8}px`);

        actual = rect(altura - 90);   // el teclado bajó: el «+» está abajo
        act(() => { window.dispatchEvent(new Event('resize')); });
        expect(menu.style.bottom).toBe(`${90 + 8}px`);
    });

    it('el atajo «Escanear» trata el toque como el «+»: anula pointerdown, mousedown y touchend', () => {
        // En iOS el foco salta al LEVANTAR el dedo: sin anular `touchend` el teclado se cerraba igual (probado por el
        // dueño con el primer arreglo, que solo anulaba `pointerdown`).
        const src = readFileSync(resolve(__dirname, '../pages/AgentPage.jsx'), 'utf8');
        const chip = src.slice(src.indexOf("onPointerDown={a.accion === 'escanear'"), src.indexOf("if (a.accion === 'escanear') {"));
        expect(chip).toMatch(/prepareAttachmentPickerGesture\(\);[\s\S]*event\.preventDefault\(\);/);
        expect(chip).toMatch(/onMouseDown=\{a\.accion === 'escanear' \? keepComposerFocus : undefined\}/);
        expect(chip).toMatch(/onTouchEnd=[\s\S]*if \(!toque \|\| toque\.movido \|\| !event\.cancelable\) return;\s*event\.preventDefault\(\);\s*markAppComposerGesture\('escanear'\);\s*void openAttachmentPicker\(\);/);
        expect(chip).toMatch(/consumeAppComposerClick\('escanear'\)/);
    });
});
