import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyThemePref } from '../utils/theme';

const leer = (rel) => readFileSync(join(__dirname, '..', '..', rel), 'utf8').replace(/\r/g, '');

describe('Opción A: hoja inferior de adjuntos, miniaturas compactas con teclado y teclado oscuro', () => {
    const agentSrc = leer('src/pages/AgentPage.jsx');
    const htmlSrc = leer('index.html');

    it('al abrir el selector nativo con teclado abierto suelta el foco y usa AttachmentSourceSheet (anchorRect null)', () => {
        expect(agentSrc).toContain('if (abierto) chatInputRef.current?.blur();');
        expect(agentSrc).toContain('if (teniaTeclado) chatInputRef.current?.blur();');
        expect(agentSrc).toContain('setAttachmentAnchorRect(null);');
        expect(agentSrc).toContain('setAttachmentSheetOwnsFocus(!teniaTeclado);');
    });

    it('cierra automáticamente el panel de adjuntos al enfocar el cuadro, escribir o elegir archivos', () => {
        expect(agentSrc).toMatch(/const handleFileSelect = \(e\) => \{\s*if \(showAttachmentSource\) setShowAttachmentSource\(false\);/);
        expect(agentSrc).toMatch(/onChange=\{\(e\) => \{\s*if \(showAttachmentSource\) setShowAttachmentSource\(false\);/);
        expect(agentSrc).toMatch(/onFocus=\{\(\) => \{\s*if \(showAttachmentSource\) setShowAttachmentSource\(false\);/);
    });

    it('compacta las miniaturas adjuntas a 64 px cuando el teclado está abierto y aplica color-scheme al compositor', () => {
        expect(agentSrc).toContain('html[data-kb-open] .attachment-preview {');
        expect(agentSrc).toMatch(/html\[data-kb-open\] \.attachment-preview \{[\s\S]*width:\s*64px;[\s\S]*height:\s*64px;/);
        expect(agentSrc).toContain('html[data-theme="dark"] .chat-composer-input { color-scheme: dark; }');
        expect(agentSrc).toContain('html[data-theme="light"] .chat-composer-input { color-scheme: light; }');
    });

    it('applyThemePref sincroniza colorScheme en documentElement para teclado nativo oscuro/claro', () => {
        applyThemePref('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(document.documentElement.style.colorScheme).toBe('dark');

        applyThemePref('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('index.html declara meta color-scheme y sincroniza colorScheme en el boot y estilos críticos', () => {
        expect(htmlSrc).toContain('<meta name="color-scheme" content="dark light" />');
        expect(htmlSrc).toContain('html[data-theme="dark"] { background-color: #0B1120; color-scheme: dark; }');
        expect(htmlSrc).toContain("document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';");
    });
});
