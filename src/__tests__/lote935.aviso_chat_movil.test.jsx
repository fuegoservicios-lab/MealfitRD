// El aviso es breve, está en la cabecera y nunca vuelve a la caja de escribir.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const src = readFileSync(resolve(__dirname, '../pages/AgentPage.jsx'), 'utf8');
describe('aviso del coach en la cabecera', () => {
    it('conserva el aviso completo como explicación del texto breve', () => {
        const i = src.indexOf('className="chat-aviso-ia-cabecera"');
        const nota = src.slice(i, i + 700);
        expect(nota).toContain("t('IA · Puede equivocarse')");
        expect(nota).toContain("t('El coach es una IA: puede equivocarse y no sustituye el consejo médico.')");
        expect(nota).toContain("t('El coach es una IA y puede equivocarse.')");
    });
    it('no hay aviso debajo del cuadro ni se oculta la nota en escritorio', () => {
        expect(src).not.toContain('data-testid="chat-aviso-ia"');
        expect(src).not.toMatch(/\.chat-aviso-ia-cabecera\s*\{\s*display: none/);
    });
    it('reserva la altura del encabezado fuera del contenido que se desplaza', () => {
        expect(src).toContain('margin-top: calc(3.7rem + max(env(safe-area-inset-top), 24px)) !important;');
        expect(src).toContain('padding-top: 1.25rem !important;');
    });
});
