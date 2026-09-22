// [P1-PLAN-LOTE-155 · 2026-09-22] Tres cierres del coach para la beta, los tres NATIVOS:
//
//   A · el backend manda tres cabeceras con cada 402 del coach y ninguna estaba en
//       `expose_headers`, así que el navegador se las comía. En la web no se notaba (mismo
//       origen, sin CORS); en la app TODA llamada es cross-origin. (Se ancla en el backend.)
//   B · sin esas cabeceras el chat cae al copy genérico, que invita a MEJORAR DE PLAN —
//       dentro de la app, que es justo lo que `nativeHidesCommerce()` impide en todas partes.
//   C · un motor web viejo no rompe: IGNORA `color-mix()` y compañía, y el usuario ve una
//       pantalla descolorida sin saber por qué. Ahora se lo decimos.
//
// El de C no lee el fichero: EJECUTA el script de `index.html` en un motor fingido. Es la
// única forma de saber que hace lo que dice, porque ese script no puede importarse.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '..', '..');
const leer = (rel) => fs.readFileSync(path.resolve(raiz, rel), 'utf-8');

describe('[P1-PLAN-LOTE-155 · B] el tope del coach no invita a comprar dentro de la app', () => {
    const agente = leer('src/pages/AgentPage.jsx');

    it('el copy del 402 se bifurca por `nativeHidesCommerce()`', () => {
        const bloque = agente.slice(agente.indexOf('    402: {'), agente.indexOf('    409: {'));
        expect(bloque).toContain('nativeHidesCommerce()');
        expect(bloque).toContain("t('Llegaste al límite mensual de mensajes con el coach.')");
        expect(bloque).toContain("t('Llegaste al límite mensual de tu plan. Actualiza para seguir conversando.')");
    });

    it('la rama nativa NO contiene ninguna invitación a mejorar de plan', () => {
        const bloque = agente.slice(agente.indexOf('    402: {'), agente.indexOf('    409: {'));
        const ramaNativa = bloque.slice(
            bloque.indexOf('nativeHidesCommerce()'),
            bloque.indexOf(': t(\'Llegaste al límite mensual de tu plan'),
        );
        expect(ramaNativa).not.toMatch(/Actualiza|Mejora|Upgrade/i);
    });

    it('las DOS cadenas viven en los 4 catálogos: ninguna traducción queda huérfana', () => {
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(leer(`src/i18n/locales/${loc}.json`));
            expect(cat['Llegaste al límite mensual de mensajes con el coach.'], `falta en ${loc}`).toBeTruthy();
            expect(cat['Llegaste al límite mensual de tu plan. Actualiza para seguir conversando.'], `falta en ${loc}`).toBeTruthy();
            // La cadena de la app no puede traer la invitación por la puerta de atrás.
            expect(cat['Llegaste al límite mensual de mensajes con el coach.']).not.toMatch(/upgrade|aggiorna il piano|passez à|faça upgrade/i);
        }
    });
});

describe('[P1-PLAN-LOTE-155 · D] el `code` del error del stream manda', () => {
    const agente = leer('src/pages/AgentPage.jsx');

    it('existe la tabla código → estado, con los cuatro que el backend emite', () => {
        const desde = agente.indexOf('const ESTADO_POR_CODIGO_DE_ERROR = {');
        expect(desde).toBeGreaterThan(-1);
        const bloque = agente.slice(desde, agente.indexOf('};', desde));
        expect(bloque).toMatch(/rate_limited:\s*429/);
        expect(bloque).toMatch(/unavailable:\s*503/);
        expect(bloque).toMatch(/timeout:\s*504/);
        expect(bloque).toMatch(/internal:\s*500/);
    });

    it('la rama del evento `error` la usa en vez de escribir 500 a pelo', () => {
        const desde = agente.indexOf("} else if (dataObj.type === 'error') {");
        expect(desde).toBeGreaterThan(-1);
        const bloque = agente.slice(desde, agente.indexOf('} catch (handlerError) {', desde));
        expect(bloque).toContain('ESTADO_POR_CODIGO_DE_ERROR[dataObj.code] || 500');
        expect(bloque).not.toMatch(/status:\s*500,/);
    });

    it('los tres estados que esto desbloquea tienen copy propio y dicen ESPERAR, no reintentar ya', () => {
        const copy = agente.slice(agente.indexOf('const _agentErrorCopy'), agente.indexOf('const ESTADO_POR_CODIGO_DE_ERROR'));
        for (const estado of ['429', '503', '504']) {
            expect(copy, `sin copy para ${estado}`).toContain(`    ${estado}: {`);
        }
        // El del cortacircuitos es el que importa: martillear mantiene el breaker abierto.
        const b503 = copy.slice(copy.indexOf('    503: {'), copy.indexOf('    429: {'));
        expect(b503).toMatch(/Espera unos segundos/);
    });
});

describe('[P1-PLAN-LOTE-155 · C] el aviso de motor viejo, ejecutado de verdad', () => {
    const html = leer('index.html');
    // El IIFE entero, tal cual vive en el HTML.
    const guion = (() => {
        const marca = html.indexOf("aviso.id = 'mf-motor-viejo'");
        expect(marca, 'no se encontró el script del aviso en index.html').toBeGreaterThan(-1);
        const abre = html.lastIndexOf('<script>', marca);
        const cierra = html.indexOf('</script>', marca);
        return html.slice(abre + '<script>'.length, cierra);
    })();

    const montar = ({ soportado, locale }) => {
        document.body.innerHTML = '<div id="pwa-splash"></div><div id="root"></div>';
        window.__mfLocale = locale;
        window.CSS = { supports: () => soportado };
        // eslint-disable-next-line no-new-func
        new Function(guion)();
    };

    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { delete window.__mfLocale; });

    it('con un motor que NO soporta las funciones: aparece el aviso y el splash se apaga', () => {
        montar({ soportado: false, locale: 'es-DO' });
        const aviso = document.getElementById('mf-motor-viejo');
        expect(aviso).toBeTruthy();
        expect(aviso.textContent).toContain('Tu navegador es demasiado antiguo');
        expect(document.getElementById('pwa-splash').style.display).toBe('none');
    });

    it('con un motor moderno NO aparece nada: el 99 % de la gente no ve este aviso jamás', () => {
        montar({ soportado: true, locale: 'es-DO' });
        expect(document.getElementById('mf-motor-viejo')).toBeNull();
        expect(document.getElementById('pwa-splash').style.display).not.toBe('none');
    });

    it('no bloquea: «Continuar de todos modos» lo quita', () => {
        montar({ soportado: false, locale: 'es-DO' });
        const btn = document.querySelector('#mf-motor-viejo button');
        expect(btn.textContent).toBe('Continuar de todos modos');
        btn.click();
        expect(document.getElementById('mf-motor-viejo')).toBeNull();
    });

    it('habla el idioma que el boot ya resolvió', () => {
        montar({ soportado: false, locale: 'en-US' });
        expect(document.getElementById('mf-motor-viejo').textContent).toContain('Your browser is too old');
    });

    it('un idioma que no conoce cae a español, no a una pantalla en blanco', () => {
        montar({ soportado: false, locale: 'de-DE' });
        expect(document.getElementById('mf-motor-viejo').textContent).toContain('Tu navegador es demasiado antiguo');
    });

    it('sin `CSS.supports` (motor prehistórico) también avisa', () => {
        document.body.innerHTML = '<div id="pwa-splash"></div>';
        window.__mfLocale = 'es-DO';
        window.CSS = undefined;
        // eslint-disable-next-line no-new-func
        new Function(guion)();
        expect(document.getElementById('mf-motor-viejo')).toBeTruthy();
    });

    it('los 5 idiomas están completos en los 5 mapas', () => {
        for (const mapa of ['TITULO', 'CUERPO', 'ACCION_WV', 'ACCION_OTRO', 'BOTON']) {
            const desde = guion.indexOf(`var ${mapa} = {`);
            expect(desde, `falta el mapa ${mapa}`).toBeGreaterThan(-1);
            const bloque = guion.slice(desde, guion.indexOf('};', desde));
            for (const loc of ['es-DO', 'en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
                expect(bloque, `${mapa} sin ${loc}`).toContain(`'${loc}':`);
            }
        }
    });

    it('corre ANTES del módulo de la app: si el bundle no parsea, el aviso es lo único que queda', () => {
        expect(html.indexOf("aviso.id = 'mf-motor-viejo'"))
            .toBeLessThan(html.indexOf('<script type="module" src="/src/main.jsx">'));
    });

    it('está escrito en ES5: un motor viejo no puede tropezar con el aviso que habla de él', () => {
        // Nada de `=>`, `const`/`let`, plantillas ni encadenamiento opcional: este script corre
        // precisamente donde la sintaxis moderna puede no existir.
        expect(guion).not.toMatch(/=>/);
        expect(guion).not.toMatch(/\b(const|let)\s/);
        expect(guion).not.toMatch(/`/);
        expect(guion).not.toMatch(/\?\./);
    });
});
