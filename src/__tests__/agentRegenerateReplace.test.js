import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/AgentPage.jsx', 'utf8');

describe('regenerar respuesta reemplaza la rama seleccionada', () => {
    it('retira la respuesta vieja de inmediato y reconstruye desde un snapshot explícito', () => {
        expect(source).toContain('const regenerationBase = sourceMessages.slice(0, modelMsgIndex);');
        expect(source).toContain('setMessages(regenerationBase);');
        expect(source).toContain('sourceMessages,');
        expect(source).toContain('? sourceMessages.slice(0, options.truncateIndex)');
    });

    it('envía la identidad y el contenido de la respuesta que debe sustituirse', () => {
        expect(source).toContain('regenerate_message_id: options.regenerateMessageId || undefined');
        expect(source).toContain('regenerate_response_content: options.regenerateResponseContent || undefined');
        expect(source).toContain('regenerateMessageId: targetMsg?.id');
        expect(source).toContain('regenerateResponseContent: targetMsg?.content');
    });
});
