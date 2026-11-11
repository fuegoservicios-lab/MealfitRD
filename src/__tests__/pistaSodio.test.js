import { describe, it, expect } from 'vitest';
import { pistaSodio } from '../components/dashboard/microsShared';

const t = (s) => s;

describe('pistaSodio', () => {
    it('reconoce sal, cubitos y salsa de soya', () => {
        expect(pistaSodio('Sal al gusto', t)).toMatch(/sal ≈ 2,300 mg/);
        expect(pistaSodio('1 cubito de caldo de pollo', t)).toMatch(/cubito de caldo ≈ 700/);
        expect(pistaSodio('2 cdas de salsa de soya', t)).toMatch(/soya ≈ 900 mg/);
    });
    it('no marca alimentos sin relación', () => {
        expect(pistaSodio('Salmón a la plancha', t)).toBeNull();
        expect(pistaSodio('Ensalada salada', t)).toBeNull();
        expect(pistaSodio('Pan sin sal', t)).toBeNull();
        expect(pistaSodio('Hielo', t)).toBeNull();
        expect(pistaSodio('', t)).toBeNull();
    });
});
