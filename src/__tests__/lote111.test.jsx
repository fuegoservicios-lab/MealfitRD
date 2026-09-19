// [P1-PLAN-LOTE-111 · 2026-09-19] Adjuntar en el chat de la app nativa, como ChatGPT/Gemini: la hoja sube desde el
// borde mientras el teclado baja y, al elegir o cancelar, el teclado VUELVE (el foco regresa al cuadro de texto, no
// al botón «+»). El contrato de accesibilidad de la hoja sigue en agentMobileMedia.a11y.test.jsx.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AttachmentSourceSheet } from '../components/agent/AttachmentSourceSheet';

const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

const Arnes = ({ restoreFocus }) => {
    const [open, setOpen] = React.useState(true);
    const triggerRef = React.useRef(null);
    const inputRef = React.useRef(null);
    return <>
        <textarea ref={inputRef} aria-label="mensaje" />
        <button ref={triggerRef} type="button">adjuntar</button>
        <AttachmentSourceSheet
            open={open}
            onClose={() => { if (!restoreFocus) inputRef.current.focus(); setOpen(false); }}
            onGallery={vi.fn()}
            onCamera={vi.fn()}
            triggerRef={triggerRef}
            restoreFocus={restoreFocus}
        />
    </>;
};

describe('la hoja de adjuntar', () => {
    it('con teclado previo NO devuelve el foco al «+»: se queda donde el chat lo puso (el cuadro de texto)', () => {
        render(<Arnes restoreFocus={false} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByLabelText('mensaje')).toHaveFocus();
    });
    it('sin teclado previo, el foco vuelve al disparador como siempre', () => {
        render(<Arnes restoreFocus />);
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
        expect(screen.getByRole('button', { name: 'adjuntar' })).toHaveFocus();
    });
    it('es una hoja inferior con asa, y un re-render del chat no le mueve el foco', () => {
        const { rerender } = render(<Arnes restoreFocus />);
        expect(document.querySelector('.attachment-source-grip')).toBeInTheDocument();
        screen.getByRole('button', { name: /Tomar una foto/ }).focus();
        rerender(<Arnes restoreFocus />);
        expect(screen.getByRole('button', { name: /Tomar una foto/ })).toHaveFocus();
        const css = leer('components/agent/AttachmentSourceSheet.css');
        expect(css).toContain('@keyframes attachment-sheet-in { from { transform: translateY(100%); } }');
        expect(css).toContain('border-radius: 1.4rem 1.4rem 0 0;');
    });
});

describe('modo menú: con el teclado abierto, adjuntar NO lo cierra', () => {
    const Menu = () => {
        const [open, setOpen] = React.useState(true);
        return <>
            <textarea aria-label="mensaje" autoFocus />
            <AttachmentSourceSheet
                open={open}
                onClose={() => setOpen(false)}
                onGallery={vi.fn()}
                onCamera={vi.fn()}
                restoreFocus={false}
                anchorRect={{ left: 20, top: 500 }}
            />
        </>;
    };
    it('se ancla encima del «+» y el cuadro de texto conserva el foco al abrir, al tocar y al cerrar', () => {
        render(<Menu />);
        const campo = screen.getByLabelText('mensaje');
        campo.focus();
        const hoja = screen.getByRole('dialog');
        expect(hoja.className).toContain('attachment-source-sheet--menu');
        expect(hoja.style.left).toBe('20px');
        expect(hoja.style.bottom).toBe(`${window.innerHeight - 500 + 8}px`);
        expect(document.querySelector('.attachment-source-grip')).not.toBeInTheDocument();
        expect(campo).toHaveFocus();
        // `mousedown` es lo que movería el foco: en modo menú va anulado en la hoja y en el fondo
        const sobreOpcion = fireEvent.mouseDown(screen.getByRole('button', { name: /Elegir de la galería/ }));
        expect(sobreOpcion).toBe(false);
        expect(campo).toHaveFocus();
        const sobreFondo = fireEvent.mouseDown(document.querySelector('.attachment-source-backdrop--menu'));
        expect(sobreFondo).toBe(false);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(campo).toHaveFocus();
    });
});

describe('el chat', () => {
    const src = leer('pages/AgentPage.jsx');
    it('en nativo no suelta el foco para adjuntar y ancla el menú al «+» si había teclado', () => {
        expect(src).toContain('if (abierto && !isNativeApp()) chatInputRef.current?.blur();');
        expect(src).toContain('setAttachmentAnchorRect(teniaTeclado ? (attachmentTriggerRef.current?.getBoundingClientRect?.() || null) : null);');
        expect(src).toContain('anchorRect={attachmentAnchorRect}');
        expect(src).toContain('restoreFocus={attachmentSheetOwnsFocus}');
    });
    it('tras el selector del sistema repone el teclado solo si de verdad se fue', () => {
        const i = src.indexOf('const runNativeImagePicker = async (source) => {');
        expect(src.slice(i, i + 1200)).toMatch(/finally \{[\s\S]*restoreChatKeyboardAfterAttachment\(\);/);
        const j = src.indexOf('const restoreChatKeyboardAfterAttachment = () => {');
        expect(src.slice(j, j + 600)).toContain('if (!campo || medirTecladoDeVentana(window).abierto) return;');
    });
    it('anticipa la apertura del teclado con el inset recordado, solo en la app nativa', () => {
        expect(src).toContain("document.addEventListener('focusin', alGanarElFoco);");
        expect(src).toContain("document.removeEventListener('focusin', alGanarElFoco);");
        const k = src.indexOf('const alGanarElFoco = (e) => {');
        const cuerpo = src.slice(k, k + 1600);
        expect(cuerpo).toContain('if (!isNativeApp() ||');
        expect(cuerpo).toContain('if (recordado < KB_UMBRAL_PX ||');
        expect(cuerpo).toContain('abriendoRef.current = true;');
        // y la medición «cerrado» que llega durante la subida no deshace lo anticipado
        expect(src).toMatch(/if \(abriendoRef\.current\) \{\s*if \(!abiertoMedido\) return;/);
    });
});
