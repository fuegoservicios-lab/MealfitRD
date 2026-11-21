/**
 * [P1-PLAN-LOTE-1159 · 2026-11-21] El índice de Configuración en el teléfono (el dueño: «mejora el diseño de esto»,
 * captura del iPhone): en la app Configuración es una VENTANA y la lista agrupada del lote 1124 solo valía para la
 * página (`.wrapper:not(.inDialog)`): salían siete renglones sueltos de ~80 px, sin descripción ni flecha.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const JSX = readFileSync(resolve(process.cwd(), 'src/pages/Settings.jsx'), 'utf8');
const CSS = readFileSync(resolve(process.cwd(), 'src/pages/Settings.module.css'), 'utf8').replace(/\r\n/g, '\n');
const BLOQUE = CSS.slice(CSS.indexOf('[P1-PLAN-LOTE-1159'));

describe('[1159] índice de Configuración en el teléfono', () => {
    it('tu tarjeta de perfil arriba abre General; cada fila lleva qué hay dentro', () => {
        expect(JSX).toContain("<button type=\"button\" className={styles.perfilCard} onClick={() => navigateToSection('profile')}>");
        expect(JSX).toContain('<span className={styles.sidebarDescription}>{s.description}</span>');
    });
    // [1159b] el dueño: «general y lo de mi cuenta abren lo mismo» → en el teléfono la tarjeta ES General
    it('en el teléfono la fila «General» se oculta (la tarjeta la sustituye) y dice qué hay dentro', () => {
        expect(JSX).toContain("${s.id === 'profile' ? styles.sidebarItemPerfil : ''}");
        expect(JSX).toContain("<span className={styles.perfilQue}>{t('Cuenta, apariencia y notificaciones')}</span>");
        expect(BLOQUE).toMatch(/:global\(html\[data-theme="light"\]\) \.wrapper\.inDialog \.sidebarItemPerfil \{ display: none; \}/);
        expect(BLOQUE).toContain('.wrapper.inDialog .sidebarItemPerfil + .sidebarItem::before { display: none; }');
    });
    it('la tarjeta solo en el teléfono; en PC no existe', () => {
        expect(BLOQUE).toContain('.perfilCard { display: none; }');
        expect(BLOQUE).toMatch(/@media \(max-width: 768px\) \{\s*\.perfilCard \{\s*display: flex;/);
    });
    it('la lista agrupada vale TAMBIÉN en la ventana, ganando al aplanado con prefijo de tema', () => {
        for (const tema of ['', ':global(html[data-theme="dark"]) ', ':global(html[data-theme="light"]) ']) {
            expect(BLOQUE).toContain(`${tema}.wrapper.inDialog .sidebarNav`);
            expect(BLOQUE).toContain(`${tema}.wrapper.inDialog .sidebarItem`);
        }
        expect(BLOQUE).toMatch(/\.wrapper \.sidebarDescription,[^{]*\{\s*display: block;/);
        expect(BLOQUE).toMatch(/\.wrapper \.sidebarChevron,[^{]*\{\s*display: block;/);
    });
});
