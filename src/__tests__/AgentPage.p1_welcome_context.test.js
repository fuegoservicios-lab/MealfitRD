/**
 * Regresión del reenvío del saludo inicial (`welcome_message`) al backend
 * cuando el usuario responde con un mensaje corto como "Dale" en su primer turno.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const agentPageSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/AgentPage.jsx'),
    'utf8'
);

describe('AgentPage welcome_message payload', () => {
    it('extrae el saludo único con isWelcome antes de filtrarlo y lo envía como welcome_message', () => {
        expect(agentPageSrc).toContain('const welcomeMessageForContext = (');
        expect(agentPageSrc).toContain('sourceMessages.length === 1 &&');
        expect(agentPageSrc).toContain('sourceMessages[0]?.isWelcome &&');
        expect(agentPageSrc).toContain('welcome_message: welcomeMessageForContext || undefined');
    });
});
