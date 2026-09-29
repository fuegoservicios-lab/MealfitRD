/**
 * [P1-PLAN-LOTE-845 · 2026-09-29] La app nativa sin salidas al comercio (auditoría App Store, filas 1.1 y 10.2, §A.5;
 * guideline 3.1.1).
 *
 * Tres fugas, un solo gate (`nativeHidesCommerce`, P1-IOS-NATIVE-SHELL):
 *   1. Cada enlace legal abría en Safari la página normal del apex, cuya navegación lleva «Precios». Apple exige la
 *      política accesible desde la app, así que el enlace se queda y cambia de destino: la variante `/app/*` (mismo
 *      texto, sin navegación de marketing ni precios). Se decide UNA vez, en `apexUrl()`.
 *   2. «Más información» ofrecía cuatro páginas de marketing (Acerca de, Novedades, Cómo funciona, Supermercado RD):
 *      en nativo queda solo el grupo legal.
 *   3. La cabecera de marketing (nav con «Precios» y el CTA fijo) seguía pintándose en las rutas con Layout que viven
 *      en nativo, y el pie ofrecía Novedades, Supermercado e Investigación.
 *
 * Cada caso nativo tiene su control web: un gate que escondiera el comercio también en la web sería un bug en silencio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render as renderPlano, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { render as renderConContexto } from './utils/test-utils';

// Parcial: el resto de platform.js sigue siendo el real (la cabecera arrastra módulos que usan otras funciones suyas).
vi.mock('../config/platform', async (importOriginal) => ({
    ...(await importOriginal()),
    isNativeApp: vi.fn(() => false),
    nativeHidesCommerce: vi.fn(() => false),
}));

import * as platform from '../config/platform';
import { apexUrl, APEX_ORIGIN, RUTAS_CON_VARIANTE_APP, registerNativeProbe } from '../config/site';
import { moreInfoGroups } from '../components/dashboard/moreInfoLinks';
import AccountMenu from '../components/dashboard/AccountMenu';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';

const SRC = path.resolve(__dirname, '..');
const leer = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf-8');

// La sonda de site.js se INYECTA (platform.js la registra al cargarse; aquí platform está mockeado): el test registra
// la suya y la mueve junto con el gate, como hace la app real, donde las dos salen de `isNativeApp()`.
let nativo = false;
const enNativo = (v) => {
    nativo = v;
    platform.nativeHidesCommerce.mockReturnValue(v);
    platform.isNativeApp.mockReturnValue(v);
};

beforeEach(() => {
    registerNativeProbe(() => nativo);
    enNativo(false);
});

afterEach(() => {
    enNativo(false);
    registerNativeProbe(() => false);
});

/** Las 8 variantes publicadas por 6d (landing 758c88d). */
const VARIANTES = ['/privacy', '/terms', '/medical', '/ai-policy', '/data-protection', '/acceptable-use', '/refunds', '/soporte'];

describe('[P1-PLAN-LOTE-845] apexUrl(): en nativo, la variante /app/* de cada legal', () => {
    it('la lista es exactamente la de las variantes publicadas', () => {
        expect([...RUTAS_CON_VARIANTE_APP].sort()).toEqual([...VARIANTES].sort());
        expect(Object.isFrozen(RUTAS_CON_VARIANTE_APP)).toBe(true);
    });

    it.each(VARIANTES)('en nativo %s va a su variante /app/* del apex', (ruta) => {
        enNativo(true);
        expect(apexUrl(ruta)).toBe(`${APEX_ORIGIN}/app${ruta}`);
    });

    it('conserva el ancla y la consulta', () => {
        enNativo(true);
        expect(apexUrl('/privacy#seccion-7')).toBe(`${APEX_ORIGIN}/app/privacy#seccion-7`);
        expect(apexUrl('/terms?x=1')).toBe(`${APEX_ORIGIN}/app/terms?x=1`);
    });

    it('una ruta sin variante sigue a su página de siempre (no se inventa una /app/* que no existe)', () => {
        enNativo(true);
        expect(apexUrl('/responsible-disclosure')).toBe(`${APEX_ORIGIN}/responsible-disclosure`);
        expect(apexUrl('/about')).toBe(`${APEX_ORIGIN}/about`);
        // prefijo no basta: `/privacy-extra` no es `/privacy`
        expect(apexUrl('/privacy-extra')).toBe(`${APEX_ORIGIN}/privacy-extra`);
    });

    it('en la web NO cambia (control): la variante es solo del binario', () => {
        // jsdom es `localhost`: la rama de dev devuelve la ruta tal cual, como antes.
        for (const ruta of VARIANTES) expect(apexUrl(ruta)).toBe(ruta);
        // y en producción la reescritura sigue siendo solo la del subdominio `app.`
        const src = leer('config/site.js');
        expect(src).toMatch(/return `\$\{protocol\}\/\/\$\{hostname\.replace\(\/\^app\\\.\/i, ''\)\}\$\{path\}`;/);
        expect(src, 'la variante se aplica SOLO en la rama nativa')
            .toMatch(/if \(_isNativeProbe\(\)\) return `\$\{APEX_ORIGIN\}\$\{varianteApp\(path\)\}`;/);
        expect(src.match(/varianteApp\(/g), 'una definición y UNA llamada').toHaveLength(2);
    });

    it('site.js sigue sin importar platform (lo cargan scripts de Node sin Capacitor)', () => {
        expect(leer('config/site.js')).not.toMatch(/from ['"]\.\/platform['"]/);
    });

    // UN solo sitio decide: si alguien escribe `/app/privacy` a mano en un call site, la próxima variante nueva (o una
    // que cambie de nombre) se le escapa a ese enlace.
    it('ningún call site escribe una variante /app/* a mano', () => {
        const archivos = [];
        const recorrer = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/__tests__|node_modules/.test(e.name)) recorrer(p); }
            else if (/\.(jsx?|tsx?)$/.test(e.name)) archivos.push(p);
        });
        recorrer(SRC);
        const literal = new RegExp(`/app(${VARIANTES.join('|')})\\b`);
        const culpables = archivos.filter((f) => literal.test(fs.readFileSync(f, 'utf-8')))
            .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));
        expect(culpables).toEqual([]);
    });

    // Cada `apexUrl('/…')` escrito en el código tiene variante: en nativo todos acaban en /app/*. Una ruta nueva sin
    // variante tiene que gatearse en nativo (o pedirle a 6d su página /app/*) y anotarse aquí con el porqué.
    it('todo apexUrl con ruta literal apunta a una legal con variante', () => {
        const SIN_VARIANTE_Y_GATEADAS = new Set();
        const archivos = [];
        const recorrer = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/__tests__|node_modules/.test(e.name)) recorrer(p); }
            else if (/\.jsx?$/.test(e.name)) archivos.push(p);
        });
        recorrer(SRC);
        const vistas = new Set();
        for (const f of archivos) {
            for (const m of fs.readFileSync(f, 'utf-8').matchAll(/apexUrl\(\s*'([^']+)'\s*\)/g)) vistas.add(m[1]);
        }
        expect(vistas.size, 'el escáner no vio ningún apexUrl: se rompió el vehículo').toBeGreaterThan(3);
        const fuera = [...vistas].filter((r) => !RUTAS_CON_VARIANTE_APP.includes(r) && !SIN_VARIANTE_Y_GATEADAS.has(r));
        expect(fuera).toEqual([]);
    });
});

describe('[P1-PLAN-LOTE-845] «Más información»: en nativo solo el grupo legal', () => {
    it('nativo: un solo grupo, Términos · Privacidad · Aviso médico', () => {
        enNativo(true);
        const grupos = moreInfoGroups();
        expect(grupos).toHaveLength(1);
        expect(grupos[0].map((l) => l.path)).toEqual(['/terms', '/privacy', '/medical']);
    });

    it('web (control): los dos grupos de siempre', () => {
        const grupos = moreInfoGroups();
        expect(grupos).toHaveLength(2);
        expect(grupos[0].map((l) => l.path)).toEqual(['/about', '/novedades', '/como-funciona', '/supermercado']);
        expect(grupos[1].map((l) => l.path)).toEqual(['/terms', '/privacy', '/medical']);
    });

    it('el menú de cuenta en nativo abre las tres legales en su variante /app/*', () => {
        enNativo(true);
        renderPlano(
            <MemoryRouter>
                <AccountMenu onAccount={vi.fn()} onLogout={vi.fn()} />
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByRole('menuitem', { name: /Más información/i }));
        const destinos = screen.getAllByRole('menuitem', { hidden: true })
            .filter((el) => el.tagName === 'A')
            .map((el) => el.getAttribute('href'));
        expect(destinos).toEqual([
            `${APEX_ORIGIN}/app/terms`, `${APEX_ORIGIN}/app/privacy`, `${APEX_ORIGIN}/app/medical`,
        ]);
        for (const fuera of ['Novedades', 'Cómo funciona', 'Supermercado RD']) {
            expect(screen.queryByRole('menuitem', { name: fuera, hidden: true })).toBeNull();
        }
    });
});

const enRuta = (ruta) => ({
    customContext: { planData: null, session: null },
    wrapper: ({ children }) => <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter>,
});

// Por TEXTO y por el DOM, no por rol: el CSS oculta la nav de escritorio bajo 768 px, jsdom la da por inaccesible y a un
// nodo oculto el cálculo del nombre accesible le da "" — medido: `getByRole('link', {name: 'Precios'})` no la encuentra
// ni con `hidden: true`. Con consultas por rol, «no hay enlace a Precios» pasaría en vacío aunque estuviera pintado.
const enlacesCon = (texto) => screen.queryAllByText(texto).filter((el) => el.tagName === 'A');
const navDeMarketing = () => document.querySelector('nav[aria-label="Páginas"]');

describe('[P1-PLAN-LOTE-845] la cabecera de marketing no existe en nativo', () => {
    it('web (control): en una legal interna hay nav con «Precios» y CTA fijo', () => {
        renderConContexto(<Header />, enRuta('/privacy'));
        expect(navDeMarketing()).not.toBeNull();
        expect(enlacesCon('Precios')).toHaveLength(1);
        expect(screen.getByText('Crear mi Plan Ahora')).toBeTruthy();
    });

    it('nativo: ni la nav (con «Precios») ni el CTA fijo', () => {
        enNativo(true);
        renderConContexto(<Header />, enRuta('/privacy'));
        expect(navDeMarketing()).toBeNull();
        expect(enlacesCon('Precios')).toEqual([]);
        expect(screen.queryByText('Crear mi Plan Ahora')).toBeNull();
    });

    it('nativo: el menú móvil tampoco trae la nav de marketing', () => {
        enNativo(true);
        renderConContexto(<Header />, enRuta('/research'));
        fireEvent.click(screen.getByLabelText('Abrir menú de navegación'));
        for (const item of ['Cómo funciona', 'Funciones', 'Precisión', 'Investigación', 'Precios']) {
            expect(enlacesCon(item), item).toEqual([]);
        }
    });

    it('web (control): el menú móvil sí la trae', () => {
        renderConContexto(<Header />, enRuta('/research'));
        fireEvent.click(screen.getByLabelText('Abrir menú de navegación'));
        // dos: la del escritorio (oculta por CSS) y la del menú móvil
        expect(enlacesCon('Precios')).toHaveLength(2);
    });

    it('la nav y el CTA pasan por el ÚNICO gate', () => {
        const src = leer('components/layout/Header.jsx');
        expect(src).toMatch(/import \{ nativeHidesCommerce \} from '\.\.\/\.\.\/config\/platform'/);
        expect(src).toMatch(/const showMarketingNav = isLandingLike && !nativeHidesCommerce\(\);/);
        expect(src).toMatch(/const showStickyCta = isLandingLike && !hideStartNow && !nativeHidesCommerce\(\);/);
        expect(src).toMatch(/\{showMarketingNav && \(\s*<nav className=\{styles\.navMarketing\}/);
        expect(src).toMatch(/\{showMarketingNav && navSections\.map\(/);
        expect(src, 'volvió una nav gateada solo por isLandingLike').not.toMatch(/\{isLandingLike && (\(|navSections)/);
    });
});

const pie = (ruta = '/privacy') => renderPlano(
    <MemoryRouter initialEntries={[ruta]}>
        <Footer />
    </MemoryRouter>,
);

describe('[P1-PLAN-LOTE-845] el pie en nativo', () => {
    it('nativo: sin Novedades, Supermercado, Investigación, Acerca de ni Divulgación Responsable', () => {
        enNativo(true);
        pie();
        for (const texto of ['Novedades', 'Supermercados RD', 'Investigación', 'Bioboros', 'Divulgación Responsable']) {
            expect(enlacesCon(texto), texto).toEqual([]);
        }
        expect(screen.queryByText('Empresas'), 'la columna sin destinos no se pinta vacía').toBeNull();
    });

    it('nativo: cada enlace al apex va a su variante /app/*, y siguen las siete legales', () => {
        enNativo(true);
        const { container } = pie();
        const alApex = [...container.querySelectorAll('a')]
            .map((a) => a.getAttribute('href'))
            .filter((h) => h && h.startsWith(APEX_ORIGIN));
        expect(alApex.sort()).toEqual([
            '/acceptable-use', '/ai-policy', '/data-protection', '/medical', '/privacy', '/refunds', '/terms',
        ].map((r) => `${APEX_ORIGIN}/app${r}`).sort());
        expect(within(container).getByRole('link', { name: 'bioboros.support@gmail.com' })).toBeTruthy();
    });

    it('web (control): el pie de siempre, con Empresas y la divulgación responsable', () => {
        pie();
        for (const texto of ['Novedades', 'Supermercados RD', 'Investigación', 'Bioboros', 'Divulgación Responsable']) {
            expect(enlacesCon(texto), texto).toHaveLength(1);
        }
        expect(screen.getByText('Empresas')).toBeTruthy();
    });
});

describe('[P1-PLAN-LOTE-845] «Marcas del súper» no enlaza el catálogo público en nativo', () => {
    it('el enlace «+N en el catálogo» pasa por el gate', () => {
        const src = leer('components/dashboard/SupermarketBrands.jsx');
        expect(src).toMatch(/import \{ nativeHidesCommerce \} from '\.\.\/\.\.\/config\/platform'/);
        const i = src.indexOf('/supermercado?q=');
        expect(i, 'no se encontró el enlace al catálogo').toBeGreaterThan(0);
        expect(src.slice(Math.max(0, i - 400), i)).toMatch(
            /\{!nativeHidesCommerce\(\) && g\.variants\.length > g\.shownVariants\.length && \(/,
        );
    });
});
