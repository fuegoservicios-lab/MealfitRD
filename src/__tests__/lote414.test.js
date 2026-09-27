// [P1-PLAN-LOTE-414 · 2026-09-27] El atajo del chat «Escanear mi plato» sin el emoji de cámara.
//
// El dueño (captura de los atajos del 411): «elimina ese svg de cámara de "Escanear mi plato"». El 📷 era parte del
// texto (y de la clave de traducción): el atajo ya se distingue de las preguntas por su tinte (`chat-quick-chip-accion`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { atajosDelChat } from '../utils/atajosDelChat';

const t = (s) => s;
const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('[414] «Escanear mi plato» sin emoji', () => {
    it('el atajo dice solo «Escanear mi plato»', () => {
        const [escanear] = atajosDelChat({ hora: 13, modoContador: true, t });
        expect(escanear).toMatchObject({ id: 'escanear', tipo: 'accion', texto: 'Escanear mi plato' });
    });

    it('ningún catálogo guarda la clave vieja con el emoji; los cuatro traducen la nueva', () => {
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(leer(`i18n/locales/${loc}.json`));
            expect(cat['📷 Escanear mi plato'], loc).toBeUndefined();
            expect(cat['Escanear mi plato'], loc).toBeTruthy();
            expect(cat['Escanear mi plato'], loc).not.toMatch(/📷/u);
        }
    });
});
