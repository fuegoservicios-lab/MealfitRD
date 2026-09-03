// [P2-AVATAR-PICKER-REMOVE · 2026-09-03] El avatar del perfil se elige directo (fila de opciones:
// inicial + los 11 minimalistas) y se puede QUITAR con una «×»; antes un solo botón ciclaba por
// 12 estados y no había forma de volver a la inicial salvo dar la vuelta entera.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('src/pages/Settings.jsx');
const CSS = read('src/pages/Settings.module.css');

describe('avatar del perfil: elegir directo y quitar', () => {
    it('el ciclo desapareció; se elige y se persiste con una sola función', () => {
        expect(SRC).not.toContain('cycleAvatar');
        expect(SRC).not.toContain('_AVATAR_CYCLE');
        expect(SRC).toContain('const chooseAvatar = (next) => {');
        expect(SRC).toContain('persistAvatar(next);');
    });
    it('la «×» solo existe con un avatar elegido y vuelve a la inicial', () => {
        const i = SRC.indexOf('{avatarId && (');
        expect(i).toBeGreaterThan(0);
        const block = SRC.slice(i, i + 700);
        expect(block).toContain('className={styles.avatarRemove}');
        expect(block).toContain('onClick={() => chooseAvatar(null)}');
        expect(block).toContain("aria-label={t('Quitar avatar')}");
    });
    it('fila de opciones accesible: radiogroup con la inicial + los 11 avatares', () => {
        expect(SRC).toContain('role="radiogroup" aria-label={t(\'Elegir avatar\')}');
        expect(SRC).toContain("aria-label={t('Usar mi inicial')}");
        expect(SRC).toContain('{MINIMAL_AVATARS.map((a, i) => (');
        expect(SRC).toContain("aria-label={t('Avatar {n}', { n: i + 1 })}");
        expect(SRC).toContain('aria-checked={avatarId === a.id}');
    });
    it('estilos por tokens: la «×» se tiñe de peligro al hover y la opción elegida lleva anillo', () => {
        expect(CSS).toContain('.avatarRemove:hover {');
        expect(CSS).toContain('color: var(--danger);');
        expect(CSS).toContain('.avatarOptionOn {');
        expect(CSS).toContain('box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 4px var(--primary);');
    });
    it('catálogos: claves nuevas en los 4 idiomas y las del ciclo fuera', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            for (const k of ['Quitar avatar', 'Elegir avatar', 'Usar mi inicial', 'Avatar {n}']) {
                expect(cat[k], `${loc}: ${k}`).toBeTruthy();
            }
            expect(cat['Toca para cambiar tu avatar'], loc).toBeUndefined();
            expect(cat['Cambiar avatar (toca para alternar)'], loc).toBeUndefined();
        }
    });
});
