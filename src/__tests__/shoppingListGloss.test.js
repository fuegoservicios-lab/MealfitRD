// [P1-PLAN-DISPLAY-I18N · Task 5 · 2026-08-19] Unit tests del helper SSOT
// `glossShoppingItemName` (frontend/src/utils/shoppingHelpers.js) + parser
// blanket de que la lista de compras del PDF (Dashboard.jsx) lo consume con
// fallback — ver docs/superpowers/specs/2026-08-19-plan-display-i18n-design.md,
// regla de oro: "el usuario cocina en su idioma pero COMPRA en español", la
// lista de compras es BILINGÜE, jamás inglés puro.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { glossShoppingItemName } from '../utils/shoppingHelpers';

const __dirname = dirname(fileURLToPath(import.meta.url));

function _readSrc(relPath) {
    return readFileSync(join(__dirname, '..', relPath), 'utf-8');
}

describe('glossShoppingItemName — es-DO / locale ausente', () => {
    it('es-DO devuelve el nombre español tal cual, aunque haya displayNameEn', () => {
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', 'es-DO'))
            .toBe('Habichuelas negras');
    });

    it('locale ausente/undefined/null -> nombre español tal cual', () => {
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', undefined))
            .toBe('Habichuelas negras');
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', null))
            .toBe('Habichuelas negras');
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', ''))
            .toBe('Habichuelas negras');
    });
});

describe('glossShoppingItemName — fallback silencioso sin displayNameEn', () => {
    it('displayNameEn ausente -> nombre español tal cual, en cualquier locale no-es-DO', () => {
        expect(glossShoppingItemName('Habichuelas negras', undefined, 'en-US'))
            .toBe('Habichuelas negras');
        expect(glossShoppingItemName('Habichuelas negras', null, 'pt-BR'))
            .toBe('Habichuelas negras');
    });

    it('displayNameEn vacío/blank -> nombre español tal cual (no gloss vacío)', () => {
        expect(glossShoppingItemName('Habichuelas negras', '', 'en-US'))
            .toBe('Habichuelas negras');
        expect(glossShoppingItemName('Habichuelas negras', '   ', 'en-US'))
            .toBe('Habichuelas negras');
    });

    it('displayNameEn no-string (número/objeto) -> nombre español tal cual, no lanza', () => {
        expect(() => glossShoppingItemName('Habichuelas negras', 42, 'en-US')).not.toThrow();
        expect(glossShoppingItemName('Habichuelas negras', 42, 'en-US')).toBe('Habichuelas negras');
    });
});

describe('glossShoppingItemName — gloss bilingüe "English (Español)"', () => {
    it('locale en-US + displayNameEn presente -> "English (Español)"', () => {
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', 'en-US'))
            .toBe('Black beans (Habichuelas negras)');
    });

    it('mismo gloss para pt-BR/fr-FR/it-IT (name_en es un campo estático del catálogo, '
        + 'no traducido por-locale como meal._display — fase 1b solo cubre inglés)', () => {
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', 'pt-BR'))
            .toBe('Black beans (Habichuelas negras)');
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', 'fr-FR'))
            .toBe('Black beans (Habichuelas negras)');
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', 'it-IT'))
            .toBe('Black beans (Habichuelas negras)');
    });

    it('recorta espacios sobrantes de displayNameEn', () => {
        expect(glossShoppingItemName('Habichuelas negras', '  Black beans  ', 'en-US'))
            .toBe('Black beans (Habichuelas negras)');
    });

    it('name español ausente/vacío -> solo el gloss inglés (nunca paréntesis vacíos)', () => {
        expect(glossShoppingItemName('', 'Black beans', 'en-US')).toBe('Black beans');
        expect(glossShoppingItemName(null, 'Black beans', 'en-US')).toBe('Black beans');
    });

    it('name no-string se castea a String antes del gloss', () => {
        expect(glossShoppingItemName(42, 'Forty-two', 'en-US')).toBe('Forty-two (42)');
    });
});

// ---------------------------------------------------------------------------
// Parser blanket: el render de la lista de compras del PDF (Dashboard.jsx)
// consume `glossShoppingItemName` con el campo `display_name_en` del backend
// (fallback silencioso si falta). tooltip-anchor: si el import o el nombre
// del campo cambian de forma, este test debe fallar ANTES de que el PDF
// pierda el gloss bilingüe en silencio.
// ---------------------------------------------------------------------------
describe('Dashboard.jsx (PDF de la lista de compras) consume glossShoppingItemName', () => {
    it('importa glossShoppingItemName desde utils/shoppingHelpers', () => {
        const src = _readSrc('pages/Dashboard.jsx');
        expect(src).toMatch(/from ['"]\.\.\/utils\/shoppingHelpers['"]/);
        expect(/\bglossShoppingItemName\(/.test(src)).toBe(true);
    });

    it('llama glossShoppingItemName con item_ref?.display_name_en (fallback con `?.`)', () => {
        const src = _readSrc('pages/Dashboard.jsx');
        expect(src).toMatch(/glossShoppingItemName\([^)]*item_ref\?\.display_name_en[^)]*\)/);
    });
});
