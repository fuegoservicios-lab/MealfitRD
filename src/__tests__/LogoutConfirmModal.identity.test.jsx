// [P2-LOGOUT-IDENTITY-CARD · 2026-09-03] El modal de cerrar sesión enseña QUÉ cuenta se cierra
// (avatar con iniciales + nombre + correo), una nota que quita el miedo y la acción principal
// como botón sólido con «Cancelar» secundario. La confirmación se conserva a propósito.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initialsFor } from '../utils/initials';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('src/components/dashboard/LogoutConfirmModal.jsx');
const CSS = read('src/components/dashboard/LogoutConfirmModal.module.css');

describe('iniciales del avatar', () => {
    it('primera letra del nombre y del apellido; sin nombre cae al correo; sin nada, «?»', () => {
        expect(initialsFor('Angelo Brito', 'x@y.com')).toBe('AB');
        expect(initialsFor('  angelo  de la cruz ', null)).toBe('AC');
        expect(initialsFor('Angelo', null)).toBe('A');
        expect(initialsFor('', 'maria@correo.com')).toBe('M');
        expect(initialsFor(null, null)).toBe('?');
    });
});

describe('markup y jerarquía', () => {
    it('fila de identidad + nota + confirmar sólido / cancelar fantasma; la confirmación sigue existiendo', () => {
        expect(SRC).toContain("import { initialsFor } from '../../utils/initials';");
        expect(SRC).toContain('className={styles.identity}');
        expect(SRC).toContain("{isGuest ? '?' : initialsFor(userName, userEmail)}");
        expect(SRC).toContain("t('Tu plan, tu Nevera y tu historial quedan guardados en tu cuenta.')");
        expect(SRC).toContain("t('Sesión de invitado')");
        expect(SRC).not.toContain('¿Cerrar sesión de {app} como');
        // orden: confirmar primero (principal), cancelar debajo
        expect(SRC.indexOf('id="logout-confirm-btn"')).toBeLessThan(SRC.indexOf('id="logout-cancel-btn"'));
        expect(CSS).toContain('background: var(--text-main);');      // tinta
        expect(CSS).toContain('background: transparent;');            // fantasma
        expect(CSS).not.toContain('#1a1a2e');                          // nada de card fija por tema
        expect(CSS).not.toContain(':global(');
        expect(CSS).toContain('white-space: pre-line;');               // el título trae salto de línea en la clave
    });
    it('los tres call sites pasan el nombre de la cuenta', () => {
        expect(read('src/components/dashboard/DashboardLayout.jsx')).toContain('userName={accountName}');
        expect(read('src/components/layout/Header.jsx')).toContain('userName={accountName}');
        expect(read('src/components/assessment/InteractiveAssessmentLayout.jsx')).toContain('userName={userProfile?.full_name}');
    });
    it('catálogos: claves nuevas en los 4 idiomas y la vieja fuera', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat['Tu plan, tu Nevera y tu historial quedan guardados en tu cuenta.'], loc).toBeTruthy();
            expect(cat['Sesión de invitado'], loc).toBeTruthy();
            expect(cat['¿Cerrar sesión de {app} como'], loc).toBeUndefined();
        }
    });
});
