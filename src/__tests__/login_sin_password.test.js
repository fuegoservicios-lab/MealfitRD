/**
 * [P0-01 · 2026-08-18] La superficie de contraseña no existe, y tiene que seguir sin existir.
 *
 * POR QUÉ. `GHSA-qq9h-g4jm-xgf3` (account takeover vía *pre-account hijacking*)
 * afecta a Better Auth < 1.6.22 cuando conviven **email-OTP** y **alta con
 * contraseña**: un atacante planta una contraseña sobre un correo que aún no
 * tiene cuenta, y cuando la víctima entra por OTP se encuentra con una
 * credencial ajena ya asociada. El lockfile resuelve `better-auth@1.4.18` a
 * través de Neon, así que la app está en el rango afectado.
 *
 * La mitad de ese "conviven" que **sí** controlamos desde este repo es la
 * segunda: si no hay forma de plantar una contraseña, no hay ataque que montar
 * desde la UI. Medido hoy: cero inputs `type="password"`, ninguna pantalla de
 * registro, y nadie llama a `signUp()` ni `signInWithPassword()` fuera del
 * adaptador. La entrada de `EXCEPCIONES` en `scripts/audit-gate.mjs` declara esa
 * mitigación, y una mitigación declarada que nadie comprueba es un comentario.
 *
 * Este test es lo que la convierte en verificable. Si alguien añade login o alta
 * por contraseña, este fichero se pone rojo **antes** de que la excepción del
 * gate pase a ser mentira.
 *
 * ⚠️ Lo que este test NO demuestra: que el servidor gestionado de Neon tenga el
 * endpoint de contraseña desactivado. La lógica vulnerable corre allí, y un
 * atacante puede llamar a la API sin pasar por esta UI. Eso se cierra
 * confirmando la versión con Neon (o desactivando el método en su panel), y por
 * eso la excepción del gate caduca el 2026-09-15 en vez de quedarse abierta.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');
const LOGIN = fs.readFileSync(path.join(SRC, 'pages', 'Login.jsx'), 'utf8');

/** Todos los .jsx/.js de src salvo tests y el propio adaptador. */
function ficherosDeApp() {
    const salida = [];
    (function andar(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (e.name === '__tests__' || e.name === 'node_modules') continue;
                andar(p);
            } else if (/\.(jsx?|tsx?)$/.test(e.name) && e.name !== 'authClient.js') {
                salida.push(p);
            }
        }
    })(SRC);
    return salida;
}

describe('[P0-01] la app no expone superficie de contraseña', () => {
    it('Login.jsx no tiene ningún input de contraseña', () => {
        const inputs = LOGIN.match(/type=["']password["']/g) || [];
        expect(inputs, 'apareció un campo de contraseña en el login; la mitigación declarada en audit-gate deja de ser cierta').toHaveLength(0);
    });

    it('nadie llama a signUp() ni signInWithPassword() fuera del adaptador', () => {
        const culpables = [];
        for (const f of ficherosDeApp()) {
            const txt = fs.readFileSync(f, 'utf8');
            // Se busca la LLAMADA, no la mención: el adaptador los define y los
            // tests hablan de ellos; lo que importa es que nadie los invoque.
            if (/\.\s*signUp\s*\(/.test(txt) || /\.\s*signInWithPassword\s*\(/.test(txt)) {
                culpables.push(path.relative(SRC, f));
            }
        }
        expect(culpables, 'alguien invoca alta/login por contraseña: reabre el vector del GHSA-qq9h-g4jm-xgf3').toEqual([]);
    });

    it('el login entra por OTP y por OAuth, que es la alternativa segura', () => {
        expect(/signInWithOAuth\s*\(/.test(LOGIN), 'el login debería ofrecer OAuth').toBe(true);
        expect(/otp/i.test(LOGIN), 'el login debería ofrecer OTP').toBe(true);
    });

    it('la excepción del gate declara esta mitigación y tiene fecha de caducidad', () => {
        const gate = fs.readFileSync(path.resolve(SRC, '..', 'scripts', 'audit-gate.mjs'), 'utf8');
        expect(gate).toContain('GHSA-qq9h-g4jm-xgf3');
        // El anclaje cruzado importa: si alguien borra este test, el gate sigue
        // apuntando a un fichero que ya no existe y eso se ve.
        expect(gate, 'la excepción debe citar el test que la verifica').toContain('login_sin_password.test.js');
        expect(gate, 'la excepción debe llevar fecha de caducidad').toMatch(/caduca:\s*'2026-\d\d-\d\d'/);
    });
});
