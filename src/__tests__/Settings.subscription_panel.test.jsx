// [P2-SUBSCRIPTION-PANEL · 2026-09-03] Configuración → Suscripción y Pagos: card del plan actual
// (pastilla de estado + créditos disponibles con barra + la fecha que toca) y la escalera de
// planes desde el SSOT `config/plans.js`, con tokens del tema en vez de ternarios `_settingsDark`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('src/pages/Settings.jsx');
const NL = String.fromCharCode(10);
// Solo CÓDIGO: un literal citado en un comentario no es copy (comentario-vence-guard).
const CODE = SRC.split(NL).filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join(NL);
const start = CODE.indexOf('const renderSubscriptionSection = () => {');
const PANEL = CODE.slice(start, CODE.indexOf('    };', start));

describe('Suscripción y Pagos: card del plan actual', () => {
    it('la sección se pinta desde una sola función y el JSX viejo desapareció', () => {
        expect(start).toBeGreaterThan(0);
        expect(CODE).toContain("{activeSection === 'subscription' && renderSubscriptionSection()}");
        expect(CODE).not.toContain("t('Estás en el')");
        expect(CODE).not.toContain("t('Activo (Cancelada)')");
        expect(CODE).not.toContain('No tienes ninguna suscripción activa que cancelar');
    });
    it('pastilla de estado por tier, créditos disponibles con barra y la fecha que corresponde', () => {
        expect(PANEL).toContain("? ['ending', t('No se renueva')]");
        expect(PANEL).toContain("isPaidSubscriber ? ['active', t('Activo')]");
        expect(PANEL).toContain("t('Créditos disponibles')");
        expect(PANEL).toContain("t('de {total}', { total: formatNumber(_total) })");
        // rojo SOLO en 0, ámbar en el último (P3-CREDITS-LAST-ONE)
        expect(PANEL).toContain("const _barState = _left === 0 ? 'is-out' : (_left === 1 ? 'is-low' : '');");
        expect(PANEL).toContain("_cancelled && _endLabel ? [t('Acceso hasta'), _endLabel]");
        expect(PANEL).toContain("isPaidSubscriber && !_cancelled && _endLabel ? [t('Próximo cobro'), _endLabel]");
        expect(PANEL).toContain("[t('Se renuevan'), creditsRenewalLabel()]");
    });
    it('la fecha de renovación de créditos es UNA aritmética compartida con Plan & Objetivo', () => {
        expect(CODE).toContain('const creditsRenewalLabel = () => {');
        expect(CODE).toContain('const _fecha = creditsRenewalLabel();');
        expect(CODE.match(/Date\.UTC\(_now\.getUTCFullYear\(\), _now\.getUTCMonth\(\) \+ 1, 1\)/g)).toHaveLength(1);
    });
    it('cero ternarios de tema dentro del panel: todo por tokens', () => {
        expect(PANEL).not.toContain('_settingsDark');
        expect(PANEL).not.toContain('#DCFCE7');
        expect(PANEL).toContain('background: var(--bg-card);');
        expect(PANEL).toContain('html[data-theme="dark"] .sub-cta { background: var(--primary-fill); }');   // índigo 700 vía token (P2-PRIMARY-FILL-INK)
    });
});

describe('Suscripción y Pagos: escalera de planes', () => {
    it('sale del SSOT config/plans.js, marca «Tu plan» y abre el checkout directo del tier', () => {
        expect(CODE).toContain("import { LAUNCH_OFFER, PRICING, TIER_CREDITS, TIER_RANK, isLaunchOfferActive, periodLabel, tierDisplayName } from '../config/plans';");
        expect(PANEL).toContain('const _goCheckout = (tier) => navigate(`/dashboard/upgrade?checkout=${tier}&billing=monthly`);');
        expect(PANEL).toContain("{isCurrent && <span className=\"sub-tier-tag\">{t('Tu plan')}</span>}");
        expect(PANEL).toContain("t('{n} créditos al mes', { n: formatNumber(TIER_CREDITS[tier]) })");
        expect(PANEL).toContain('US${PRICING[tier].monthly.price}');
        // filas por debajo del tier actual: visibles pero sin acción (no se ofrece bajar de plan aquí)
        expect(PANEL).toContain("const selectable = !isCurrent && !isBelow;");
        expect(PANEL).toContain("const Row = selectable ? 'button' : 'div';");
        // oferta de lanzamiento: precio futuro tachado + fecha desde el SSOT, no a mano
        expect(PANEL).toContain('{_offer && <s>US${LAUNCH_OFFER.futureMonthly[tier]}</s>}');
        expect(PANEL).toContain('new Date(`${LAUNCH_OFFER.deadlineISO}T00:00:00Z`)');
    });
    it('no hay escalera ni «Mejorar mi plan» para Max ni para administradores', () => {
        expect(PANEL).toContain("const _canUpgrade = !_isAdmin && _tier !== 'ultra';");
        expect(PANEL).toContain('const _showLadder = _canUpgrade;');
    });
});

describe('catálogos', () => {
    it('las claves nuevas están en los 4 idiomas y las huérfanas salieron', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            for (const k of ['Créditos disponibles', 'de {total}', 'Se renuevan', 'Próximo cobro', 'Acceso hasta',
                'No se renueva', 'Otros planes', 'Precio de lanzamiento hasta el {fecha}', '{n} créditos al mes']) {
                expect(cat[k], `${loc}: ${k}`).toBeTruthy();
            }
            expect(cat['Estás en el'], loc).toBeUndefined();
            expect(cat['Activo (Cancelada)'], loc).toBeUndefined();
        }
    });
});
