/**
 * [P1-CHAT-NARRATION-KEPT-REVIEW-2 · 2026-07-28] ChatWidget.jsx es un
 * segundo consumidor SSE independiente de `/api/chat/stream` (el otro es
 * AgentPage.jsx) y seguía haciendo el blind-replace `fullText =
 * dataObj.response` en el evento `done` — el MISMO anti-patrón que
 * P1-CHAT-NARRATION-KEPT cerró en AgentPage.jsx, pero nunca migrado acá, con
 * cero cobertura de test. Hallazgo de review adversarial:
 * "ChatWidget.jsx is a second, independent SSE consumer... but was never
 * migrated to the new chatStreamReconcile.js module and has zero test
 * coverage for this behavior."
 *
 * Este archivo cierra ambos huecos:
 *   1. Regresión ESTÁTICA (mismo patrón que P1_B_chatwidget_storage_corruption):
 *      el source de ChatWidget.jsx debe usar `reconcileFinalChatText` en el
 *      handler `done`, y el patrón pre-fix `fullText = dataObj.response;`
 *      (sin reconcile) NUNCA debe reaparecer.
 *   2. Regresión FUNCIONAL: monta `<ChatWidget />` de verdad, dispara un
 *      turno narrate-then-act completo sobre un stream SSE mockeado
 *      (chunks pass 1 → progress boundary → chunks pass 2 → done con
 *      `response` unido con '\n\n' por el backend) y verifica que la
 *      narración de la PRIMERA pasada sigue visible en la burbuja final —
 *      exactamente el dato que el blind-replace pre-fix perdía.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from './utils/test-utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

vi.mock('../authClient', () => ({
    authClient: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
        from: vi.fn(),
    },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

import { fetchWithAuth } from '../config/api';
import ChatWidget from '../components/dashboard/ChatWidget';

// jsdom no implementa scrollIntoView — ChatWidget lo invoca en un
// useEffect (scrollToBottom) cada vez que `messages` cambia.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}

// Mismo helper que Plan.sse_happy_path.test.jsx: un reader que emite los
// frames dados como Uint8Array y luego `done`.
function makeSSEResponse(frames) {
    let i = 0;
    return {
        ok: true,
        status: 200,
        json: async () => ({}),
        body: {
            getReader: () => ({
                read: async () =>
                    i < frames.length
                        ? { done: false, value: new TextEncoder().encode(frames[i++]) }
                        : { done: true, value: undefined },
            }),
        },
    };
}

function genericOkResponse() {
    return { ok: true, status: 200, json: async () => ({ messages: [], sessions: [] }) };
}

describe('P1-CHAT-NARRATION-KEPT-REVIEW-2 · ChatWidget narración narrate-then-act (funcional)', () => {
    beforeEach(() => {
        vi.mocked(fetchWithAuth).mockReset();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('la narración de la 1ra pasada ("Lo anoto...") sigue visible tras el done (no la borra el blind-replace)', async () => {
        // Frames SSE reproduciendo EXACTAMENTE la acumulación real:
        //   pass 1 (chunks) → progress (tool_call boundary) → pass 2 (chunks) → done
        // El backend arma `done.response` uniendo ambas pasadas con '\n\n'
        // (`_build_final_content_from_messages`, agent.py).
        const frames = [
            'data: ' + JSON.stringify({ type: 'progress', message: 'Analizando...' }) + '\n\n',
            'data: ' + JSON.stringify({ type: 'chunk', text: 'Lo ' }) + '\n\n',
            'data: ' + JSON.stringify({ type: 'chunk', text: 'anoto...' }) + '\n\n',
            'data: ' + JSON.stringify({ type: 'progress', message: 'Registrando...' }) + '\n\n',
            'data: ' + JSON.stringify({ type: 'chunk', text: 'Listo, ' }) + '\n\n',
            'data: ' + JSON.stringify({ type: 'chunk', text: 'quedó anotado.' }) + '\n\n',
            'data: ' + JSON.stringify({
                type: 'done',
                response: 'Lo anoto...\n\nListo, quedó anotado.',
                updated_fields: {},
                new_plan: null,
            }) + '\n\n',
        ];

        vi.mocked(fetchWithAuth).mockImplementation(async (url) => {
            if (typeof url === 'string' && url.includes('/api/chat/stream')) {
                return makeSSEResponse(frames);
            }
            return genericOkResponse();
        });

        render(<ChatWidget />);

        // Abrir el widget.
        fireEvent.click(screen.getByLabelText('Abrir asistente Mealfit AI'));

        const input = await screen.findByPlaceholderText('Pregúntale a tu asistente...');
        fireEvent.change(input, { target: { value: 'me comí pollo con arroz' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        // La narración final debe contener AMBAS pasadas — la primera
        // ("Lo anoto...") NO debe desaparecer detrás de un reemplazo ciego.
        await waitFor(() => {
            expect(screen.getByText(/Lo anoto/)).toBeInTheDocument();
        });
        expect(screen.getByText(/quedó anotado/)).toBeInTheDocument();
    });
});

describe('P1-CHAT-NARRATION-KEPT-REVIEW-2 · regresión estática de ChatWidget.jsx', () => {
    const chatWidgetSrc = fs.readFileSync(
        path.resolve(__dirname, '..', 'components', 'dashboard', 'ChatWidget.jsx'),
        'utf-8'
    );

    it('importa reconcileFinalChatText/stripUiActionTags desde la SSOT compartida', () => {
        expect(chatWidgetSrc).toMatch(/import\s*\{\s*stripUiActionTags,\s*reconcileFinalChatText\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\/chatStreamReconcile['"]/);
    });

    it('el handler `done` invoca reconcileFinalChatText (no un reemplazo ciego)', () => {
        const doneHandlerRegion = chatWidgetSrc.substring(
            chatWidgetSrc.indexOf("dataObj.type === 'done'"),
            chatWidgetSrc.indexOf("dataObj.type === 'done'") + 2200
        );
        expect(doneHandlerRegion).toMatch(/reconcileFinalChatText\(/);
    });

    it('NO contiene el patrón pre-fix `fullText = dataObj.response;` (blind-replace sin reconcile)', () => {
        const blindReplacePattern = /fullText\s*=\s*dataObj\.response\s*;/;
        expect(blindReplacePattern.test(chatWidgetSrc)).toBe(false);
    });
});
