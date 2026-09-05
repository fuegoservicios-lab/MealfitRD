/**
 * [P1-CHAT-COMPOSER-CLEAR · 2026-09-05] Tras enviar una foto, la miniatura se quedaba clavada en el
 * compositor durante todo el análisis —~7 s medidos en producción— porque el único vaciado del envío corría
 * DESPUÉS de subir la imagen y recibir las URL del servidor. La foto aparecía a la vez en la conversación y
 * en la caja de escribir, con el botón en «detener»: se lee como que la app se colgó.
 *
 * Parser-based a propósito: montar `AgentPage` entero para esto costaría más de lo que ancla. Lo que hay que
 * fijar es el ORDEN (vaciar al enviar, no al terminar) y el `revoke: false`, que es lo que impide romper la
 * foto recién pintada en la conversación.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.resolve(__dirname, '../pages/AgentPage.jsx'), 'utf8');

describe('P1-CHAT-COMPOSER-CLEAR', () => {
    it('vacía el compositor en el mismo punto que la caja de texto', () => {
        const i = SRC.indexOf("setInput('');\n        // [P1-CHAT-COMPOSER-CLEAR");
        expect(i).toBeGreaterThan(-1);
        const bloque = SRC.slice(i, i + 1400);
        expect(bloque).toContain('clearAttachments({ revoke: false })');
        expect(bloque.indexOf('clearAttachments')).toBeLessThan(bloque.indexOf('setIsLoading(true)'));
    });

    it('no revoca los blob al enviar: la burbuja recién pintada los está usando', () => {
        const i = SRC.indexOf('clearAttachments({ revoke: false })');
        expect(i).toBeGreaterThan(-1);
        expect(SRC).not.toContain('clearAttachments({ revoke: true })');
    });

    it('los revoca cuando la burbuja ya tiene las URL del servidor', () => {
        const i = SRC.indexOf('clearSelectedFile();\n                // [P1-CHAT-COMPOSER-CLEAR');
        expect(i).toBeGreaterThan(-1);
        const bloque = SRC.slice(i, i + 1400);
        expect(bloque).toContain('URL.revokeObjectURL(_blob)');
        expect(bloque).toContain("_blob.startsWith('blob:')");
    });

    it('el vaciado por cambio de sesión sigue revocando', () => {
        // Ese sí puede: al cambiar de sesión ninguna burbuja viva apunta a esos blobs.
        const i = SRC.indexOf('setDraftReadySession(null)');
        const bloque = SRC.slice(i, i + 400);
        expect(bloque).toContain('clearAttachments();');
    });
});
