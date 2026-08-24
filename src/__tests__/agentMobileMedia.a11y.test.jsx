import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
    useT: () => (key, values = {}) => Object.entries(values).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        key,
    ),
}));
vi.mock('../components/common/LazyMarkdown', () => ({ default: ({ children }) => <span>{children}</span> }));
vi.mock('../components/agent/BotAvatar', () => ({ default: () => <span aria-hidden="true">bot</span> }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../utils/mobileHaptics', () => ({ triggerMobileHaptic: vi.fn() }));

import { AttachmentSourceSheet } from '../components/agent/AttachmentSourceSheet';
import { MemoizedMessageBubble } from '../components/agent/MessageBubble';

describe('[P2-CHAT-MOBILE-MEDIA] visor y hoja nativa accesibles', () => {
    it('la bienvenida predeterminada no ofrece regenerar, las respuestas reales sí', () => {
        const { rerender } = render(
            <MemoizedMessageBubble
                msg={{ role: 'model', content: 'Bienvenida', isWelcome: true }}
                index={0}
                currentSessionId="session"
                onRegenerate={vi.fn()}
            />,
        );
        expect(screen.queryByRole('button', { name: 'Regenerar respuesta' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument();

        rerender(
            <MemoizedMessageBubble
                msg={{ role: 'model', content: 'Respuesta real' }}
                index={1}
                currentSessionId="session"
                onRegenerate={vi.fn()}
            />,
        );
        expect(screen.getByRole('button', { name: 'Regenerar respuesta' })).toBeInTheDocument();
    });

    it('navega las imágenes, cierra con Escape y devuelve el foco al disparador', () => {
        render(
            <MemoizedMessageBubble
                msg={{ role: 'user', content: '', isImage: true, attachments: [
                    { id: 'one', url: '/one.jpg' },
                    { id: 'two', url: '/two.jpg' },
                ] }}
                index={0}
                currentSessionId="session"
                onRegenerate={vi.fn()}
            />,
        );
        const trigger = screen.getByRole('button', { name: 'Abrir imagen 1' });
        trigger.focus();
        fireEvent.click(trigger);
        expect(screen.getByRole('dialog', { name: 'Vista ampliada de imagen' })).toBeInTheDocument();
        expect(screen.getByText('1 / 2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Imagen siguiente' }));
        expect(screen.getByText('2 / 2')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('la hoja de origen atrapa el foco, cierra con Escape y lo restaura', () => {
        const Harness = () => {
            const [open, setOpen] = React.useState(true);
            const triggerRef = React.useRef(null);
            return <>
                <button ref={triggerRef} type="button">adjuntar</button>
                <AttachmentSourceSheet
                    open={open}
                    onClose={() => setOpen(false)}
                    onGallery={vi.fn()}
                    onCamera={vi.fn()}
                    triggerRef={triggerRef}
                />
            </>;
        };
        render(<Harness />);
        expect(screen.getByRole('button', { name: /Elegir de la galería/ })).toHaveFocus();
        screen.getByRole('button', { name: 'Cerrar' }).focus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(screen.getByRole('button', { name: /Tomar una foto/ })).toHaveFocus();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'adjuntar' })).toHaveFocus();
    });
});
