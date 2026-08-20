// [P1-MORE-INFO-IN-APP · 2026-08-10] «Entro en Novedades y me devuelve al dashboard».
//
// No era un fallo suelto: era la suma de tres decisiones correctas por separado.
//   1. El enlace cambiaba de DOMINIO — `landingUrl()` reescribía app.bioboros.com →
//      bioboros.com, porque esas páginas son marketing y su casa canónica es el apex.
//   2. Abría en PESTAÑA NUEVA (`target="_blank"`), «para no perder el dashboard».
//   3. En el apex la app fuerza estado DESLOGUEADO a propósito (P3-APEX-NO-SESSION):
//      allí el sitio es marketing puro y la sesión vive por origen.
// Juntas: tocabas «Novedades», aterrizabas en otro dominio como visitante anónimo y,
// al pulsar atrás, Safari cerraba esa pestaña y te devolvía a la del dashboard.
//
// Medido antes de tocar nada: las 7 páginas cargan igual de bien en `app.` que en el
// apex, con sesión y sin ella. Salir del dominio no le compraba NADA al usuario que
// ya está dentro — solo le costaba su sesión. El `canonical` de cada página, que es
// lo que el SEO necesitaba, no depende de adónde apunte un enlace de la app.
//
// LA LECCIÓN: tres reglas defendibles por separado pueden componer un defecto que
// ninguna de las tres tiene. Al revisar «por qué esto se comporta raro», la pregunta
// útil no es cuál de las reglas está mal, sino qué producen JUNTAS.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import AccountMenu from '../components/dashboard/AccountMenu';
import { moreInfoGroups } from '../components/dashboard/moreInfoLinks';

const LEER = (...p) => fs.readFileSync(path.resolve(__dirname, '..', ...p), 'utf-8');

// [P1-MORE-INFO-I18N · 2026-08-20] El SSOT pasó de constante a FUNCIÓN: sus
// etiquetas van por `t()` y una constante de módulo las congelaría en español al
// importar. Sin `t` devuelve el español, que es lo que estos tests comparan.
const TODAS = moreInfoGroups().flat();

describe('[P1-MORE-INFO-IN-APP] «Más información» no saca al usuario de su sesión', () => {
    it('los enlaces del menú de cuenta son rutas in-app, en la misma pestaña', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AccountMenu onAccount={vi.fn()} onLogout={vi.fn()} />
            </MemoryRouter>,
        );
        // El submenú nace plegado (igual que en el móvil): hay que abrirlo para que
        // los enlaces existan. Un test que los buscara sin desplegar mediría el vacío.
        // El disparador es un `menuitem`; dentro del panel hay OTRO control con el
        // mismo texto visible (el de volver), así que se busca por rol para no
        // depender de cuál aparece primero.
        await user.click(screen.getByRole('menuitem', { name: /Más información/i }));
        expect(TODAS.length).toBeGreaterThanOrEqual(7);
        for (const link of TODAS) {
            const el = screen.getByRole('menuitem', { name: new RegExp(link.label, 'i') });
            // Ruta relativa: si vuelve a llevar host, vuelve el salto de dominio.
            expect(el.getAttribute('href'), `${link.label} debe ser ruta in-app`).toBe(link.path);
            expect(
                el.getAttribute('target'),
                `${link.label} no debe abrir pestaña nueva desde el menú`,
            ).toBeNull();
        }
    });

    it('ninguna superficie reescribe el host de estos enlaces', () => {
        // El helper que lo hacía se eliminó. Si reaparece —aquí o en otro archivo—,
        // vuelve el aterrizaje como anónimo en el dominio público.
        for (const f of [
            ['components', 'dashboard', 'moreInfoLinks.js'],
            ['components', 'dashboard', 'AccountMenu.jsx'],
            ['components', 'dashboard', 'DashboardLayout.jsx'],
            ['pages', 'Settings.jsx'],
        ]) {
            const src = LEER(...f);
            const codigo = src
                .split('\n')
                .filter((ln) => !ln.trim().startsWith('//') && !ln.trim().startsWith('*'))
                .join('\n');
            expect(codigo, `${f.join('/')} vuelve a reescribir el host`).not.toMatch(/landingUrl\s*\(/);
        }
    });

    it('las páginas legales de Configuración conservan la pestaña nueva, pero in-app', () => {
        // Matiz deliberado: viven dentro del diálogo de Configuración y navegar en la
        // misma pestaña sacaría al usuario del ajuste a media frase. Lo que cambia es
        // el DESTINO, no el comportamiento de apertura.
        const src = LEER('pages', 'Settings.jsx');
        expect(src).toMatch(/href=\{link\.path\}/);
        expect(src).toMatch(/href="\/privacy"/);
        expect(src).not.toMatch(/href=\{landingUrl/);
    });
});

/* [P1-MORE-INFO-I18N · 2026-08-20] El submenú «Más información» seguía en español
 * con la app en inglés: «Acerca de Bioboros», «Novedades», «Términos de servicio»…
 * colgando de un menú padre ya traducido (Settings / More info / Get help).
 *
 * SE TRADUCE LA ETIQUETA, NO EL CONTENIDO. El menú es chrome de la app; las páginas
 * legales siguen SOLO en español a propósito (P1-I18N-DASHBOARD: traducir un
 * contrato genera obligaciones). Un usuario en inglés lee «Terms of Service» y
 * aterriza en un contrato en español — deliberado, y preferible a un menú a medias.
 */
describe('[P1-MORE-INFO-I18N] las etiquetas del submenú se traducen', () => {
    const SRC_SSOT = LEER('components/dashboard/moreInfoLinks.js');

    it('el SSOT es una FUNCIÓN, no una constante de módulo', () => {
        // La trampa del congelado: un `const X = [{ label: t('...') }]` a nivel de
        // módulo se evalúa UNA vez al importar —antes de que `initLocale()` cargue el
        // catálogo— y se queda en español para siempre, además de no reaccionar al
        // cambio de idioma. En es-DO parece correcto, que es lo que lo hace difícil
        // de ver.
        expect(SRC_SSOT).toMatch(/export function moreInfoGroups\(/);
        expect(SRC_SSOT, 'volvió la constante congelada')
            .not.toMatch(/export const MORE_INFO_GROUPS\s*=/);
    });

    it('las 7 etiquetas pasan por t()', () => {
        for (const clave of [
            'Acerca de Bioboros', 'Novedades', 'Cómo funciona', 'Supermercado RD',
            'Términos de servicio', 'Política de privacidad', 'Aviso médico',
        ]) {
            // Sin escapado de metacaracteres a propósito: las 7 claves son palabras
            // llanas. Escaparlas exigía un regex con `${}` DENTRO de la interpolación
            // de un template literal, y eso no compila.
            expect(SRC_SSOT, `«${clave}» no pasa por t()`)
                .toContain(`label: t('${clave}')`);
        }
    });

    it('los literales son visibles para i18n:check (alias llamado `t`)', () => {
        // Si el alias local se llama `tr`/`traducir`, el checker no reconoce la
        // llamada, da las 7 claves por HUÉRFANAS y ese aviso —«cambiaron el copy y
        // la traducción quedó atrás»— se apaga a base de falsos positivos.
        expect(SRC_SSOT).toMatch(/const t = typeof traducir === 'function'/);
    });

    it.each([
        'components/dashboard/AccountMenu.jsx',
        'components/dashboard/DashboardLayout.jsx',
    ])('%s llama al SSOT con `t`', (rel) => {
        const src = LEER(rel);
        expect(src).toMatch(/moreInfoGroups\(t\)\.map/);
        expect(src, 'quedó un consumidor de la constante vieja')
            .not.toMatch(/MORE_INFO_GROUPS/);
    });
});
