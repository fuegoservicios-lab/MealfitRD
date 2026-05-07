/**
 * Tests P1-1: `escapeHtml` para sanitizar valores dinámicos antes de
 * interpolarlos en el `htmlContent` del PDF de la lista de compras.
 *
 * Bug original (audit P1-1):
 *   El generador de PDF en `Dashboard.jsx` (handleDownloadShoppingList)
 *   construía un template-literal `htmlContent` y lo asignaba a
 *   `element.innerHTML`. Las interpolaciones de `${cat}`, `${display}`,
 *   `${displayQty}`, `${item._inventoryNote}` venían de:
 *     - Gemini (LLM) — nombres de ingredientes y descripciones.
 *     - Usuario — `_pantry_supplement_required`, `otherAllergies`, etc.
 *     - Supabase — `ingredient_name` de `user_inventory`.
 *   Sin sanitización, un valor como `</li><img src=x onerror=...>`:
 *     - Rompe el DOM del PDF (categorías/items duplicados, listado truncado).
 *     - Causa que la descarga falle o produzca un PDF malformado.
 *     - NO ejecuta JS (html2canvas serializa, no eval), pero el daño
 *       estructural es suficiente para entregar al usuario un PDF inservible.
 *
 * Fix:
 *   Helper `escapeHtml(value)` aplicado a cada interpolación de fuente
 *   no-confiable. Escapa los 5 metacaracteres HTML (& < > " ').
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../utils/shoppingHelpers';
import fs from 'node:fs';
import path from 'node:path';


describe('P1-1 — escapeHtml comportamiento básico', () => {
    it('escapa los 5 metacaracteres HTML', () => {
        expect(escapeHtml('<')).toBe('&lt;');
        expect(escapeHtml('>')).toBe('&gt;');
        expect(escapeHtml('&')).toBe('&amp;');
        expect(escapeHtml('"')).toBe('&quot;');
        expect(escapeHtml("'")).toBe('&#39;');
    });

    it('escapa una secuencia mixta sin doble-escape', () => {
        // El orden importa: `&` debe escaparse PRIMERO para no doble-encodear
        // las entidades introducidas por los reemplazos posteriores.
        expect(escapeHtml('<a href="x" onclick=\'evil&boom\'>')).toBe(
            '&lt;a href=&quot;x&quot; onclick=&#39;evil&amp;boom&#39;&gt;'
        );
    });

    it('preserva caracteres Unicode (fracciones, emojis, tildes)', () => {
        expect(escapeHtml('½ lb pollo')).toBe('½ lb pollo');
        expect(escapeHtml('🥩 PROTEÍNAS')).toBe('🥩 PROTEÍNAS');
        expect(escapeHtml('Plátano maduro')).toBe('Plátano maduro');
    });

    it('preserva texto sin metacaracteres intacto', () => {
        expect(escapeHtml('500 g de pollo')).toBe('500 g de pollo');
        expect(escapeHtml('Lista de Compras')).toBe('Lista de Compras');
    });

    it('maneja inputs no-string sin lanzar', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(0)).toBe('0');
        expect(escapeHtml(42)).toBe('42');
        expect(escapeHtml(false)).toBe('false');
        expect(escapeHtml(true)).toBe('true');
        // Objetos se convierten a "[object Object]" — no es bonito pero no lanza.
        expect(() => escapeHtml({})).not.toThrow();
    });
});


describe('P1-1 — Vectores de inyección reales del audit', () => {
    it('neutraliza `</li><img src=x onerror=...>` (vector exacto del audit)', () => {
        const malicious = '</li><img src=x onerror=alert(1)>';
        const escaped = escapeHtml(malicious);
        // El `<` ya no abre tag, el `>` ya no cierra.
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
        // El payload "img src=x" como texto literal sí sobrevive — pero
        // como TEXTO, no como elemento DOM. Eso es exactamente el contrato.
        expect(escaped).toContain('img src=x');
        // Confirma que el PDF NO interpretará esto como markup.
        expect(escaped).toBe('&lt;/li&gt;&lt;img src=x onerror=alert(1)&gt;');
    });

    it('neutraliza nombre de ingrediente con tag balanceado', () => {
        // El LLM podría hallucinar algo como "<b>Pollo</b>" o un usuario podría
        // tipear "<script>alert(1)</script>" en otherAllergies.
        const inputs = [
            '<b>Pollo</b>',
            '<script>alert(1)</script>',
            '<svg/onload=alert(1)>',
        ];
        for (const input of inputs) {
            const out = escapeHtml(input);
            expect(out).not.toMatch(/<[a-z]/i);
            expect(out).not.toMatch(/[a-z]>/i);
        }
    });

    it('neutraliza atributo con quotes que rompería un style="..."', () => {
        // Si un valor termina con `"` rompería el `style="..."` del span padre.
        const broken = '500g " /><script>alert(1)</script>';
        const out = escapeHtml(broken);
        expect(out).not.toContain('"');
        expect(out).toContain('&quot;');
    });
});


// ============================================================
// Defensa estructural: Dashboard.jsx aplica escapeHtml a las interpolaciones
// críticas del PDF. Filtramos comentarios para que las explicaciones del bug
// (que mencionan los patrones `${cat}`, `${display}`, etc literalmente) no
// produzcan falsos positivos.
// ============================================================
describe('P1-1 — Dashboard.jsx aplica escapeHtml en el htmlContent del PDF', () => {
    const dashPath = path.resolve(__dirname, '..', '..', 'pages', 'Dashboard.jsx');
    const src = fs.readFileSync(dashPath, 'utf-8');
    // Filtramos líneas-comentario.
    const codeOnly = src
        .split('\n')
        .filter((ln) => !ln.trim().startsWith('//'))
        .join('\n');

    it('importa `escapeHtml` desde shoppingHelpers', () => {
        expect(codeOnly).toMatch(/import\s*\{[^}]*\bescapeHtml\b[^}]*\}\s*from\s*['"][^'"]*shoppingHelpers/);
    });

    it('aplica escapeHtml a `cat` (categoría del item) en código activo', () => {
        // La interpolación cruda `${cat}` (sin escapar) ya NO debe aparecer.
        // Filtros: solo dentro del header del card.
        // Buscar la interpolación correcta `${escapeHtml(cat)}`.
        expect(codeOnly).toMatch(/\$\{\s*escapeHtml\(\s*cat\s*\)\s*\}/);
        // Y el patrón roto `${cat}` (sin escapeHtml) NO debe estar en código.
        expect(codeOnly).not.toMatch(/h3[^>]*>\$\{cat\}<\/h3>/);
    });

    it('aplica escapeHtml a `display` (nombre del ingrediente)', () => {
        expect(codeOnly).toMatch(/\$\{\s*escapeHtml\(\s*display\s*\)\s*\}/);
    });

    it('aplica escapeHtml a `displayQty` (cantidad humanizada)', () => {
        expect(codeOnly).toMatch(/\$\{\s*escapeHtml\(\s*displayQty\s*\)\s*\}/);
    });

    it('aplica escapeHtml a `item._inventoryNote`', () => {
        expect(codeOnly).toMatch(/\$\{\s*escapeHtml\(\s*item\._inventoryNote\s*\)\s*\}/);
    });

    it('Comentario [P1-1] documenta el rationale en Dashboard.jsx', () => {
        expect(src).toMatch(/\[P1-1\]/);
    });
});
