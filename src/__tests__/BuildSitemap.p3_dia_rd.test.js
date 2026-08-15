/**
 * [P3-SITEMAP-DIA-RD + P3-LLMS-TXT · 2026-08-15] El generador del sitemap.
 *
 * El bug de la fecha sólo se manifiesta entre las 20:00 y la medianoche de RD, así
 * que un test que llamara a la función sin argumentos pasaría 20 horas al día por
 * la razón equivocada. Por eso `hoyEnRD` acepta la fecha: para poder situarse EN
 * la ventana donde fallaba.
 */
import { describe, it, expect } from 'vitest';
import { hoyEnRD, construirLlmsTxt, construirSitemap } from '../../scripts/build-sitemap.mjs';

describe('P3-SITEMAP-DIA-RD · el día es el de RD, no el de UTC', () => {
    it('a las 22:30 de RD el sitemap NO dice mañana', () => {
        // 2026-08-14 22:30 en RD == 2026-08-15 02:30 UTC.
        // Con `toISOString()` a secas esto daba `2026-08-15`: un sitemap que
        // afirma haberse publicado en el futuro. Reproducido en un build real el
        // 2026-08-14 a las 22:5x.
        expect(hoyEnRD(new Date('2026-08-15T02:30:00Z'))).toBe('2026-08-14');
    });

    it('justo antes de medianoche UTC sigue siendo el día anterior en RD', () => {
        expect(hoyEnRD(new Date('2026-08-14T23:59:00Z'))).toBe('2026-08-14');
    });

    it('a media mañana de RD coincide con UTC (el caso que NO distingue nada)', () => {
        // Este es el caso que un test ingenuo habría usado, y por el que habría
        // pasado sin comprobar nada: 14:00 UTC = 10:00 RD, mismo día.
        expect(hoyEnRD(new Date('2026-08-14T14:00:00Z'))).toBe('2026-08-14');
    });

    it('el cruce real de medianoche en RD (04:00 UTC) avanza el día', () => {
        expect(hoyEnRD(new Date('2026-08-15T03:59:00Z'))).toBe('2026-08-14');
        expect(hoyEnRD(new Date('2026-08-15T04:00:00Z'))).toBe('2026-08-15');
    });

    it('el sitemap usa la fecha que se le pasa', () => {
        expect(construirSitemap('2026-08-14')).toContain('<lastmod>2026-08-14</lastmod>');
    });
});

describe('P3-LLMS-TXT · el mapa para modelos sale del mismo SSOT', () => {
    const txt = construirLlmsTxt();

    it('cumple lo que Lighthouse pedía: H1 y enlaces', () => {
        // Antes NO existía el fichero, y el fallback SPA devolvía `index.html` con
        // HTTP 200 — así que Lighthouse auditaba la portada creyendo que era el
        // llms.txt y reportaba «missing H1, no links». Describía el index.html.
        expect(txt).toMatch(/^# \S/m);
        expect((txt.match(/^- \[/gm) || []).length).toBeGreaterThan(10);
    });

    it('incluye /supermercado — la deriva concreta que el sitemap ya había sufrido', () => {
        expect(txt).toContain('/supermercado');
    });

    it('excluye /cookies, que es una redirección', () => {
        expect(txt).not.toContain('/cookies');
    });

    it('separa producto de legal, para que un modelo no cite los Términos como feature', () => {
        expect(txt).toContain('## Páginas');
        expect(txt).toContain('## Legal');
        expect(txt.indexOf('## Páginas')).toBeLessThan(txt.indexOf('## Legal'));
    });

    it('dice de dónde sale, para que nadie lo edite a mano', () => {
        expect(txt).toMatch(/GENERA|no lo edites/i);
    });
});
