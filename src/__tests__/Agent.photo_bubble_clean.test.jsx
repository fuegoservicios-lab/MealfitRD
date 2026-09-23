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
    // [P1-PLAN-LOTE-169 · 2026-09-23] La foto del usuario ya no va DENTRO de una burbuja: el mensaje es un grupo sin
    // chrome (`.msg-user-grupo`) y, sin texto, no existe `.msg-bubble-user` — que en el teléfono enmarcaba la foto por
    // CSS con !important aunque el estilo en línea dijera «transparente». La promesa de este test sigue en pie.
    it('foto SOLA: sin fondo, sin borde y sin padding', () => {
        const { container } = render(<MemoizedMessageBubble msg={{ role: 'user', content: '', attachments: [foto] }} index={0} currentSessionId="s1" />);
        expect(container.querySelector('.msg-bubble-user')).toBeNull();
        const b = container.querySelector('.msg-user-grupo');
        expect(b).toBeTruthy();
        expect(['', 'transparent']).toContain(b.style.background);
        // jsdom devuelve 'medium' para `border: none` (normaliza a border-style); lo que
        // importa es que no quede una línea visible.
        expect(b.style.border).not.toContain('1px');
        expect(b.style.border).not.toContain('solid');
        expect(['', '0', '0px']).toContain(b.style.padding);
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
        // [P1-PLAN-LOTE-169] sin texto de verdad no se pinta la burbuja del texto (el grupo no lleva chrome)
        const { container } = render(<MemoizedMessageBubble msg={{ role: 'user', content: '   \n  ', attachments: [foto] }} index={0} currentSessionId="s1" />);
        expect(container.querySelector('.msg-bubble-user')).toBeNull();
        expect(['', 'transparent']).toContain(container.querySelector('.msg-user-grupo').style.background);
    });

    it('la imagen se sigue mostrando', () => {
        render(<MemoizedMessageBubble msg={{ role: 'user', content: '', attachments: [foto] }} index={0} currentSessionId="s1" />);
        expect(screen.getByRole('img')).toHaveAttribute('src', foto.url);
    });
});
