/**
 * [P1-APEX-PRECACHE-BLIND · 2026-08-14] Qué entra y qué no al precache.
 *
 * El caso central de este fichero es la REGRESIÓN QUE YA OCURRIÓ durante la
 * implementación: el primer intento clasificaba por dominancia («≥50% de los
 * módulos del chunk son de la familia») y NO atrapó el chunk de replay, porque
 * Rollup mete ahí también medio `@sentry/core` y el core diluía la proporción.
 * El test `atrapa el chunk de replay aunque venga diluido` existe para que nadie
 * vuelva a una métrica de volumen: en un chunk mixto, la parte pesada y la parte
 * que lo identifica no son la misma cosa.
 */
import { describe, it, expect } from 'vitest';
import {
    familiaMarcada,
    chunksNoPrecacheables,
    auditarPesoPrecache,
    FAMILIAS_NO_PRECACHEABLES,
} from '../../scripts/precacheAudience.mjs';

const nm = (p, f = 'index.js') => `/proj/node_modules/${p}/${f}`;

describe('P1-APEX-PRECACHE-BLIND · clasificación por marcadores', () => {
    it('atrapa el chunk de replay aunque venga diluido en @sentry/core', () => {
        // Composición real medida el 2026-08-14: mucho core, algo de replay.
        const moduleIds = [
            ...Array.from({ length: 40 }, (_, i) => nm('@sentry/core', `m${i}.js`)),
            ...Array.from({ length: 12 }, (_, i) => nm('@sentry/browser', `b${i}.js`)),
            ...Array.from({ length: 6 }, (_, i) => nm('@sentry-internal/replay', `r${i}.js`)),
        ];
        // Sólo el 10% es replay: una regla de dominancia lo dejaría pasar.
        expect(familiaMarcada(moduleIds)).toBe('sentry-replay');
    });

    it('reconoce el SDK de auth y la cadena de markdown', () => {
        expect(familiaMarcada([nm('@neondatabase/auth'), nm('zod')])).toBe('auth-sdk');
        expect(familiaMarcada([nm('micromark-core-commonmark'), nm('unified')])).toBe('markdown');
    });

    it('no marca el chunk de ARRANQUE de Sentry: el apex sí lo ejecuta', () => {
        // `sentryBoot` (init) corre en los DOS hosts. Si esto se marcara, el apex
        // dejaría de precachear la captura de errores de su propia portada.
        const soloCore = [
            ...Array.from({ length: 30 }, (_, i) => nm('@sentry/core', `m${i}.js`)),
            nm('@sentry/browser'),
            nm('@sentry/react'),
        ];
        expect(familiaMarcada(soloCore)).toBeNull();
    });

    it('no marca chunks de producto ni vendor genérico', () => {
        expect(familiaMarcada(['/proj/src/pages/Home.jsx'])).toBeNull();
        expect(familiaMarcada([nm('react'), nm('react-dom')])).toBeNull();
        expect(familiaMarcada([])).toBeNull();
    });

    it('cada familia declara el gate de runtime que la apaga', () => {
        // Sin el gate escrito, la exclusión es una afirmación sin respaldo: nadie
        // puede comprobar después si sigue siendo cierta.
        for (const f of FAMILIAS_NO_PRECACHEABLES) {
            expect(f.gate, `la familia ${f.id} no declara gate`).toBeTruthy();
            expect(f.marcadores.length).toBeGreaterThan(0);
        }
    });
});

describe('P1-APEX-PRECACHE-BLIND · el shell es intocable', () => {
    const bundle = {
        'assets/entry.js': {
            type: 'chunk', isEntry: true, fileName: 'assets/entry.js',
            imports: ['assets/vendor.js'], moduleIds: ['/proj/src/main.jsx'],
        },
        'assets/vendor.js': {
            type: 'chunk', isEntry: false, fileName: 'assets/vendor.js',
            imports: [], moduleIds: [nm('react')],
        },
        'assets/replay.js': {
            type: 'chunk', isEntry: false, fileName: 'assets/replay.js',
            imports: [], moduleIds: [nm('@sentry-internal/replay')],
            viteMetadata: { importedCss: new Set(['assets/replay.css']) },
        },
    };

    it('excluye el chunk marcado y su CSS', () => {
        const fuera = chunksNoPrecacheables(bundle);
        expect(fuera.has('assets/replay.js')).toBe(true);
        expect(fuera.has('assets/replay.css')).toBe(true);
    });

    it('jamás excluye el entry ni sus imports estáticos', () => {
        // Si un marcador acabara en el shell eager, el problema es que algo se
        // volvió eager. Excluirlo del precache lo TAPARÍA en vez de mostrarlo.
        const conMarcadorEnElShell = {
            ...bundle,
            'assets/entry.js': {
                ...bundle['assets/entry.js'],
                moduleIds: ['/proj/src/main.jsx', nm('@sentry-internal/replay')],
            },
            'assets/vendor.js': {
                ...bundle['assets/vendor.js'],
                moduleIds: [nm('react'), nm('@neondatabase/auth')],
            },
        };
        const fuera = chunksNoPrecacheables(conMarcadorEnElShell);
        expect(fuera.has('assets/entry.js')).toBe(false);
        expect(fuera.has('assets/vendor.js')).toBe(false);
    });
});

describe('P1-APEX-PRECACHE-BLIND · guard de peso', () => {
    const pesos = {
        'assets/vendor-react-abc.js': 70 * 1024,
        'assets/Home-def.js': 17 * 1024,
        'assets/desconocido-ghi.js': 80 * 1024,
        'assets/pequeno-jkl.js': 4 * 1024,
    };
    const pesoGz = (u) => pesos[u] || 0;
    const manifest = Object.keys(pesos).map((url) => ({ url }));

    it('denuncia lo pesado que nadie revisó', () => {
        const { ok, intrusos } = auditarPesoPrecache(manifest, pesoGz, {
            umbralKb: 30, revisados: ['assets/vendor-react-'],
        });
        expect(ok).toBe(false);
        expect(intrusos.map((i) => i.url)).toEqual(['assets/desconocido-ghi.js']);
    });

    it('los prefijos revisados van SIN hash, o caducarían cada deploy', () => {
        const { ok } = auditarPesoPrecache(manifest, pesoGz, {
            umbralKb: 30,
            revisados: ['assets/vendor-react-', 'assets/desconocido-'],
        });
        expect(ok).toBe(true);
    });

    it('lo que está por debajo del umbral no molesta', () => {
        const { ok } = auditarPesoPrecache(
            [{ url: 'assets/pequeno-jkl.js' }], pesoGz, { umbralKb: 30, revisados: [] },
        );
        expect(ok).toBe(true);
    });
});
