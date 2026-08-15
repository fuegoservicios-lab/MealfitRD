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
        //
        // [P1-I18N-DASHBOARD · 2026-08-15] Una familia puede identificarse por
        // PAQUETE de node_modules (`marcadores`) o por RUTA DE FUENTE (`rutas`).
        // Lo segundo nació con los catálogos de idioma, que son código propio:
        // `_paqueteDe` devuelve null para ellos, así que una regla que solo mire
        // node_modules no puede verlos. Lo que este assert vigila es que la
        // familia declare ALGO por lo que reconocerse — una sin ningún
        // identificador no casaría nunca y sería configuración muerta que
        // aparenta proteger algo.
        for (const f of FAMILIAS_NO_PRECACHEABLES) {
            expect(f.gate, `la familia ${f.id} no declara gate`).toBeTruthy();
            const identificadores = (f.marcadores || []).length + (f.rutas || []).length;
            expect(
                identificadores,
                `la familia ${f.id} no declara ni marcadores ni rutas: no casaría con nada`
            ).toBeGreaterThan(0);
        }
    });

    it('[P1-I18N-DASHBOARD] los catálogos de idioma quedan fuera del precache', () => {
        // El guard los cazó en su primer build: 244 KiB gz entre los cuatro,
        // que un visitante anónimo del apex se bajaría en la instalación del SW
        // para una portada escrita en español que no usa ninguna de sus claves.
        expect(familiaMarcada(['/proj/src/i18n/locales/fr-FR.json'])).toBe('i18n-catalogs');
        expect(familiaMarcada(['/proj/src/i18n/locales/pt-BR.json'])).toBe('i18n-catalogs');
        // El MOTOR sí es shell: va en el entry y no debe marcarse.
        expect(familiaMarcada(['/proj/src/i18n/index.js'])).toBeNull();
        expect(familiaMarcada(['/proj/src/i18n/locales.js'])).toBeNull();
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
