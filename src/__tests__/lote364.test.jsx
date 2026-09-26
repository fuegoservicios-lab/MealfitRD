// [P1-PLAN-LOTE-364 · 2026-09-26] Los avisos automáticos del coach no se regeneran.
//
// El dueño: «quita lo de regenerar respuestas en estos mensajes automáticos». Además de sobrar, era un bug: el aviso
// («Es el momento perfecto para desayunar…») no responde a nada, y «Regenerar» buscaba hacia atrás la última pregunta
// del usuario —de horas antes— y REEMPLAZABA el aviso por otra respuesta a esa pregunta vieja. Regla: se regenera
// solo la respuesta cuyo mensaje anterior es del usuario.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoizedMessageBubble } from '../components/agent/MessageBubble';
import { respondeAlUsuario } from '../utils/chatTimeline';

const msgs = [
    { role: 'user', content: '¿Qué ceno?' },
    { role: 'model', content: 'Un pescado.' },
    { role: 'model', content: 'Es el momento perfecto para desayunar.' },
];

describe('[364] «Regenerar» solo en respuestas a un mensaje tuyo', () => {
    it('respondeAlUsuario mira el mensaje justo anterior', () => {
        expect(respondeAlUsuario(msgs, 1)).toBe(true);
        expect(respondeAlUsuario(msgs, 2)).toBe(false);
        expect(respondeAlUsuario(msgs, 0)).toBe(false);
    });

    it('el aviso automático no muestra «Regenerar»; copiar y valorar siguen', () => {
        render(React.createElement(MemoizedMessageBubble, {
            msg: msgs[2], index: 2, currentSessionId: 's', onRegenerate: () => {}, onErrorRetry: () => {}, puedeRegenerar: false,
        }));
        expect(screen.queryByRole('button', { name: 'Regenerar respuesta' })).toBeNull();
        expect(screen.getByRole('button', { name: /Copiar/ })).toBeTruthy();
    });

    it('una respuesta normal sí lo muestra', () => {
        render(React.createElement(MemoizedMessageBubble, {
            msg: msgs[1], index: 1, currentSessionId: 's', onRegenerate: () => {}, onErrorRetry: () => {}, puedeRegenerar: true,
        }));
        expect(screen.getByRole('button', { name: 'Regenerar respuesta' })).toBeTruthy();
    });

    it('las dos listas lo calculan y el handler lo defiende', () => {
        const lista = readFileSync(resolve(__dirname, '..', 'components', 'agent', 'VirtualizedMessageList.jsx'), 'utf8');
        const pagina = readFileSync(resolve(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        expect(lista).toContain('puedeRegenerar={respondeAlUsuario(messages, index)}');
        expect(pagina).toContain('puedeRegenerar={respondeAlUsuario(messages, i)}');
        expect(pagina).toContain('if (!targetMsg?.isWelcome && !respondeAlUsuario(messagesRef.current, modelMsgIndex)) return;');
    });
});
