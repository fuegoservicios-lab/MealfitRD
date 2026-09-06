// [P2-PHOTO-BUBBLE-CLEAN · 2026-09-06] La foto sola no lleva el chrome de una burbuja de texto.
//
// La burbuja del usuario lleva siempre fondo gris, borde y 0,85rem×1,4rem de padding — chrome
// pensado para TEXTO. Cuando el mensaje es únicamente una imagen, ese chrome la enmarca en un
// recuadro gris que no aporta nada: la miniatura ya tiene su propio radio y su propio recorte.
// Con texto (foto + comentario) el chrome SÍ hace falta y se queda como estaba, que es la mitad
// que este test protege: quitarlo siempre dejaría el comentario flotando sin burbuja.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../i18n/useT', () => ({ useT: () => (s) => s, default: () => (s) => s }));

import { MemoizedMessageBubble } from '../components/agent/MessageBubble';

const foto = { id: 'a1', url: 'blob:http://localhost/foto' };

function pintar(msg) {
    const { container } = render(
        <MemoizedMessageBubble msg={msg} index={0} currentSessionId="s1" />
    );
    // la burbuja es el nodo con la clase del rol
    return container.querySelector('.msg-bubble-user, .msg-bubble-bot');
}

describe('[P2-PHOTO-BUBBLE-CLEAN] burbuja de foto', () => {
    it('foto SOLA: sin fondo, sin borde y sin padding', () => {
        const b = pintar({ role: 'user', content: '', attachments: [foto] });
        expect(b).toBeTruthy();
        expect(b.style.background).toBe('transparent');
        // jsdom devuelve 'medium' para `border: none` (normaliza a border-style); lo que
        // importa es que no quede una línea visible.
        expect(b.style.border).not.toContain('1px');
        expect(b.style.border).not.toContain('solid');
        expect(b.style.padding === '0px' || b.style.padding === '0').toBe(true);
    });

    it('foto CON texto: el chrome se queda', () => {
        const b = pintar({ role: 'user', content: '¿esto cuántas calorías tiene?', attachments: [foto] });
        expect(b.style.background).not.toBe('transparent');
        expect(b.style.border).toContain('1px');
        expect(b.style.padding).not.toBe('0px');
    });

    it('texto sin foto: intacto', () => {
        const b = pintar({ role: 'user', content: 'hola' });
        expect(b.style.background).not.toBe('transparent');
        expect(b.style.padding).not.toBe('0px');
    });

    it('la burbuja del bot no se ve afectada', () => {
        const b = pintar({ role: 'model', content: 'respuesta' });
        expect(b.style.background).not.toBe('transparent');
    });

    it('foto sola: el contenido en blanco no cuenta como texto', () => {
        const b = pintar({ role: 'user', content: '   \n  ', attachments: [foto] });
        expect(b.style.background).toBe('transparent');
    });

    it('la imagen se sigue mostrando', () => {
        render(<MemoizedMessageBubble msg={{ role: 'user', content: '', attachments: [foto] }} index={0} currentSessionId="s1" />);
        expect(screen.getByRole('img')).toHaveAttribute('src', foto.url);
    });
});
