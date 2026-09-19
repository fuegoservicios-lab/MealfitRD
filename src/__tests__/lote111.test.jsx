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

describe('el chat devuelve el teclado', () => {
    const src = leer('pages/AgentPage.jsx');
    it('recuerda si había teclado al abrir la hoja en nativo', () => {
        expect(src).toContain('reopenKeyboardAfterAttachmentRef.current = teniaTeclado;');
        expect(src).toContain('setAttachmentSheetOwnsFocus(!teniaTeclado);');
        expect(src).toContain('restoreFocus={attachmentSheetOwnsFocus}');
    });
    it('lo devuelve al cancelar (dentro del toque) y al terminar el selector nativo, pase lo que pase', () => {
        const i = src.indexOf('const runNativeImagePicker = async (source) => {');
        const cuerpo = src.slice(i, i + 1200);
        expect(cuerpo).toMatch(/finally \{[\s\S]*restoreChatKeyboardAfterAttachment\(\);/);
        const j = src.indexOf('<AttachmentSourceSheet');
        const hoja = src.slice(j, j + 700);
        expect(hoja.indexOf('restoreChatKeyboardAfterAttachment();')).toBeGreaterThan(-1);
        expect(hoja.indexOf('restoreChatKeyboardAfterAttachment();')).toBeLessThan(hoja.indexOf('setShowAttachmentSource(false);'));
    });
});
