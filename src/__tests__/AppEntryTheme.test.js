import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { isPaperSurface, PAPER_SURFACE_ROUTES, PAPER_SURFACE_PREFIXES } from '../utils/paperSurface';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const boot = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]).find((script) => script.includes('var PAPER =') && script.includes("'data-theme'"));

// Ejecuta el script que se envía al WebView antes de montar React.
function bootTheme({ host = 'app.bioboros.com', path = '/', protocol = 'https:',
    mode = 'production', pref, systemDark = false, blockedStorage = false } = {}) {
    let theme;
    const storage = new Map([['mealfit_theme_dark_default_v1', '1']]);
    if (pref) storage.set('mealfit_theme', pref);
    runInNewContext(boot.replaceAll('%MODE%', mode), {
        location: { hostname: host, pathname: path, protocol },
        window: { matchMedia: () => ({ matches: systemDark }) },
        localStorage: {
            getItem(key) {
                if (blockedStorage) throw new Error('Storage unavailable');
                return storage.get(key) ?? null;
            },
            setItem: (key, value) => storage.set(key, value),
        },
        document: { documentElement: { setAttribute: (_, value) => { theme = value; } } },
    });
    return theme;
}

describe('App entry keeps its theme while auth/profile are loading', () => {
    it.each([
        ['web app', {}],
        ['iOS', { host: 'localhost', protocol: 'capacitor:', mode: 'native' }],
        ['Android before the native bridge loads', { host: 'localhost', mode: 'native' }],
        ['iOS protocol fallback', { host: 'localhost', protocol: 'capacitor:' }],
    ])('%s never receives the marketing paper theme', (_, environment) => {
        expect(bootTheme(environment)).toBe('dark');
        expect(bootTheme({ ...environment, pref: 'dark' })).toBe('dark');
        expect(bootTheme({ ...environment, pref: 'light' })).toBe('light');
        expect(bootTheme({ ...environment, pref: 'system', systemDark: true })).toBe('dark');
        expect(bootTheme({ ...environment, pref: 'system', systemDark: false })).toBe('light');
        expect(bootTheme({ ...environment, blockedStorage: true })).toBe('dark');
        expect(isPaperSurface('/', { appEntry: true })).toBe(false);
    });

    it.each(['bioboros.com', 'www.bioboros.com', 'localhost'])('preserves the public homepage on %s', (host) => {
        expect(bootTheme({ host })).toBe('paper');
        expect(bootTheme({ host, blockedStorage: true })).toBe('paper');
        expect(isPaperSurface('/')).toBe(true);
    });

    it.each([...PAPER_SURFACE_ROUTES.filter((path) => path !== '/'),
        ...PAPER_SURFACE_PREFIXES.map((prefix) => `${prefix}articulo`)])('preserves public paper route %s in both boot and runtime', (path) => {
        expect(isPaperSurface(path, { appEntry: true })).toBe(true);
        expect(bootTheme({ path })).toBe('paper');
        expect(bootTheme({ path, mode: 'native', blockedStorage: true })).toBe('paper');
    });

    it.each(['/login', '/dashboard', '/dashboard/agent', '/dashboard/pantry'])('keeps the app theme on %s', (path) => {
        expect(isPaperSurface(path, { appEntry: true })).toBe(false);
        expect(bootTheme({ path })).toBe('dark');
        expect(bootTheme({ path, pref: 'light' })).toBe('light');
    });
});
