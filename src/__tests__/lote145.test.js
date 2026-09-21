// [P1-PLAN-LOTE-145 · 2026-09-20] El modal de «cerrar sesión» enseña el correo también en la app nativa.
//
// El dueño, con captura del iPhone: «¿no debería aparecerme el correo cuando yo vaya a cerrar sesión?». Salía solo
// «angelo»: el modal leía el correo de `session.user.email`, y la sesión propia de la app nativa no siempre lo trae.
// El perfil sí. Es justo el dato que ese modal existe para enseñar (¿de QUÉ cuenta salgo?).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 145 · el correo en el modal de cerrar sesión', () => {
    it('el armazón del dashboard cae al correo del PERFIL y le pasa al modal el mismo que al menú de cuenta', () => {
        const src = leer('src/components/dashboard/DashboardLayout.jsx');
        expect(src).toContain("const realEmail = session?.user?.email || userProfile?.email || '';");
        expect(src).toMatch(/<LogoutConfirmModal[\s\S]{0,260}userEmail=\{accountEmail\}/);
    });

    it('la cabecera pública hace lo mismo', () => {
        const src = leer('src/components/layout/Header.jsx');
        expect(src).toContain("const accountEmail = isGuest ? '' : (userProfile?.email || session?.user?.email || '');");
        expect(src).toMatch(/<LogoutConfirmModal[\s\S]{0,900}userEmail=\{accountEmail \|\| undefined\}/);
    });
});
