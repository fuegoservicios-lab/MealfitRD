/* [P2-NEVERA-UNIT-SYSTEM-POR-PAIS · 2026-08-23] El SSOT del sistema de unidades, probado como
   funciones puras.

   El guard parser-based vive en `backend/tests/test_p2_nevera_unit_system_por_pais.py` (la
   paridad del mapa contra `COUNTRY_PROFILES`, que las dos superficies consumen el SSOT y que
   las constantes son las del backend). Esto prueba lo que un parser no puede: la CONDUCTA.

   Los números esperados son los que produce `_etiqueta_metrica` hoy — el mismo caso E de ese
   fichero. Si el redondeo del backend cambia, aquel test se pone rojo y señala a este.

   `countrySystemUI` se pasa EXPLÍCITO en cada caso: la suite de vitest corre con
   `VITE_COUNTRY_SYSTEM` apagado (P2-COUNTRY-SUITE-VITEST-PRE-FLIP), así que dejarlo al default
   probaría el mundo pre-flip creyendo probar el actual. */
import { describe, it, expect } from 'vitest';
import {
    UNIT_SYSTEM_BY_COUNTRY,
    projectMeasureForCountry,
    unitOptionsForCountry,
    unitSystemForCountry,
} from '../config/unitSystem';

const ON = true;
const OFF = false;

describe('unitSystemForCountry', () => {
    it('sigue la tabla para los seis países', () => {
        for (const [cc, sistema] of Object.entries(UNIT_SYSTEM_BY_COUNTRY)) {
            expect(unitSystemForCountry(cc, ON)).toBe(sistema);
        }
    });

    it('lo desconocido y lo ausente caen a imperial (el fail-safe del backend)', () => {
        expect(unitSystemForCountry('Marte', ON)).toBe('imperial');
        expect(unitSystemForCountry(undefined, ON)).toBe('imperial');
        expect(unitSystemForCountry('', ON)).toBe('imperial');
    });

    it('con el sistema de países APAGADO todo el mundo es imperial', () => {
        // Apagar `VITE_COUNTRY_SYSTEM` es el rollback de una sola palanca: tiene que devolver
        // el mundo pre-flip también aquí, no sólo en los selectores.
        expect(unitSystemForCountry('ES', OFF)).toBe('imperial');
        expect(unitSystemForCountry('MX', OFF)).toBe('imperial');
    });
});

describe('projectMeasureForCountry — el DISPLAY, nunca el dato', () => {
    it('proyecta el ítem real de la corrida de España: 4,5 lbs -> 2 kg', () => {
        // RED pre-fix: la lista decía «2 kg» y esta misma fila «4,5 lbs».
        expect(projectMeasureForCountry(4.5, 'lbs', 'ES', ON))
            .toEqual({ qty: 2, unit: 'kg', converted: true });
    });

    it('replica el redondeo de `_etiqueta_metrica` en los dos lados del umbral', () => {
        expect(projectMeasureForCountry(1, 'libra', 'ES', ON))
            .toEqual({ qty: 454, unit: 'g', converted: true });
        expect(projectMeasureForCountry(2.2, 'lb', 'ES', ON))
            .toEqual({ qty: 998, unit: 'g', converted: true });
        expect(projectMeasureForCountry(8, 'oz', 'ES', ON))
            .toEqual({ qty: 227, unit: 'g', converted: true });
        expect(projectMeasureForCountry(40, 'oz', 'ES', ON))
            .toEqual({ qty: 1.1, unit: 'kg', converted: true });
    });

    it('NO toca los países imperiales: la libra es la unidad real con la que compran', () => {
        for (const cc of ['DO', 'US', 'PR']) {
            expect(projectMeasureForCountry(4.5, 'lbs', cc, ON))
                .toEqual({ qty: 4.5, unit: 'lbs', converted: false });
        }
    });

    it('NO toca lo que no es una orden de pesar', () => {
        // Un envase no se convierte: 3 «fundas» no son 1,3 kg de nada.
        for (const u of ['unidad', 'funda', 'paquete', 'lata', 'g', 'kg', 'ml']) {
            expect(projectMeasureForCountry(3, u, 'ES', ON).converted).toBe(false);
        }
    });

    it('devuelve la entrada intacta ante cantidad ausente, cero o negativa', () => {
        // 0 g y 0 lb dicen lo mismo; un negativo es dato corrupto que no mejora por
        // cambiarle la unidad.
        expect(projectMeasureForCountry(0, 'lbs', 'ES', ON).converted).toBe(false);
        expect(projectMeasureForCountry(-2, 'lbs', 'ES', ON).converted).toBe(false);
        expect(projectMeasureForCountry(null, 'lbs', 'ES', ON).converted).toBe(false);
        expect(projectMeasureForCountry('abc', 'lbs', 'ES', ON).converted).toBe(false);
    });

    it('tolera el vocabulario suelto de la unidad (mayúsculas, punto, plural)', () => {
        expect(projectMeasureForCountry(4.5, ' LBS. ', 'ES', ON).unit).toBe('kg');
        expect(projectMeasureForCountry(1, 'Libras', 'ES', ON).unit).toBe('g');
        expect(projectMeasureForCountry(8, 'Onzas', 'ES', ON).unit).toBe('g');
    });

    it('con el sistema de países apagado no convierte nada', () => {
        expect(projectMeasureForCountry(4.5, 'lbs', 'ES', OFF).converted).toBe(false);
    });

    it('no devuelve una cadena ya formateada', () => {
        // El separador decimal lo pone `formatNumber` con el idioma activo. La versión del
        // backend clava la coma y por eso escribe «1,4 kg» también en inglés.
        const r = projectMeasureForCountry(40, 'oz', 'ES', ON);
        expect(typeof r.qty).toBe('number');
    });
});

describe('unitOptionsForCountry — un SSOT, ordenado por el sistema del país', () => {
    it('al métrico le ofrece kg/g/ml antes que la libra', () => {
        const es = unitOptionsForCountry('ES', ON);
        expect(es[0]).toBe('unidad');
        expect(es.indexOf('kg')).toBeLessThan(es.indexOf('libra'));
        expect(es).toContain('ml');
    });

    it('al imperial le ofrece la libra primero', () => {
        const dominicana = unitOptionsForCountry('DO', ON);
        expect(dominicana.indexOf('libra')).toBeLessThan(dominicana.indexOf('kg'));
    });

    it('proyecta el ORDEN, no amputa la lista', () => {
        // Quitarle 'libra' a un español le rompería la fila del alimento que YA tiene
        // guardado en libras, que es justo el caso que este módulo existe para atender.
        const es = [...unitOptionsForCountry('ES', ON)].sort();
        const dominicana = [...unitOptionsForCountry('DO', ON)].sort();
        expect(es).toEqual(dominicana);
    });

    it('las dos listas que sustituye quedan cubiertas', () => {
        // `UNIT_OPTIONS` (QPantryBuilder) y `COMMON_PURCHASE_UNITS` (Pantry), menos los dos
        // sinónimos que el backend ya trataba como equivalentes ('lb' -> 'libra').
        const todo = unitOptionsForCountry('DO', ON);
        for (const u of ['unidad', 'g', 'paquete', 'lata', 'botella', 'funda', 'taza',
            'libra', 'kg', 'caja', 'cartón', 'bolsa', 'galón', 'sobre']) {
            expect(todo).toContain(u);
        }
    });
});
