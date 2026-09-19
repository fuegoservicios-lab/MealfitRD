// [P1-PLAN-LOTE-124 · 2026-09-19] Dos quejas del dueño sobre «Registrar comida»:
//  · «lo que más registras dura 1 segundo más o menos para aparecer cada vez que salgo y entro» → la hoja nace con la
//    última lista buena (utils/frequentFoodsCache.js) y vuelve a pedir por detrás;
//  · «registrar comida mediante ver días anteriores no aparece la manera de agregar mediante la cámara o foto» → el
//    diario montaba el componedor sin `onScan`; ahora cede el paso al escáner, que nace en el día que se mira.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import LogMealModal from '../components/dashboard/LogMealModal';
import {
    readFrequentFoodsCache, writeFrequentFoodsCache, clearFrequentFoodsCache, mismaListaFrecuente,
    FREQUENT_FOODS_CACHE_KEY,
} from '../utils/frequentFoodsCache';
import { getDayOptionsCon, normalizarDiasAtras, nombreDelDiaAtras } from '../components/dashboard/dayOptions';

const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');
const respuesta = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
const FRECUENTES = [
    { last_meal_id: 'f1', meal_name: 'Mangú con huevo', kcal: 675, protein: 23, carbs: 85, fats: 29, veces: 1 },
    { last_meal_id: 'f2', meal_name: 'Yuca con pollo', kcal: 520, protein: 40, carbs: 55, fats: 12, veces: 3 },
];

let frecuentesDelServidor;
vi.mock('../config/api', () => ({
    API_BASE: '',
    fetchWithAuth: vi.fn(async (url) => {
        if (String(url).includes('/foods/frequent')) return frecuentesDelServidor();
        return { ok: true, status: 200, json: async () => ({ items: [] }) };
    }),
}));

beforeEach(() => {
    localStorage.clear();
    clearFrequentFoodsCache();
    frecuentesDelServidor = () => new Promise(() => {}); // por defecto el servidor NO contesta: lo que se vea es la caché
});

describe('la caché', () => {
    it('es por usuario: otro usuario no ve la lista, y sin usuario no se guarda nada', () => {
        writeFrequentFoodsCache('u1', FRECUENTES);
        expect(readFrequentFoodsCache('u1')).toEqual(FRECUENTES);
        expect(readFrequentFoodsCache('u2')).toBeNull();
        writeFrequentFoodsCache(null, FRECUENTES);
        expect(readFrequentFoodsCache(null)).toBeNull();
    });
    it('sobrevive a recargar (localStorage) y se borra al cerrar sesión', () => {
        writeFrequentFoodsCache('u1', FRECUENTES);
        expect(JSON.parse(localStorage.getItem(FREQUENT_FOODS_CACHE_KEY)).userId).toBe('u1');
        clearFrequentFoodsCache();
        expect(localStorage.getItem(FREQUENT_FOODS_CACHE_KEY)).toBeNull();
        expect(readFrequentFoodsCache('u1')).toBeNull();
        expect(leer('context/AssessmentContext.jsx')).toContain('clearFrequentFoodsCache();');
    });
    it('una caché corrupta es «sin caché», no una excepción', () => {
        localStorage.setItem(FREQUENT_FOODS_CACHE_KEY, '{no es json');
        expect(readFrequentFoodsCache('u1')).toBeNull();
    });
    it('mismaListaFrecuente: igual contenido = no re-pintar', () => {
        expect(mismaListaFrecuente(FRECUENTES, FRECUENTES.map((x) => ({ ...x })))).toBe(true);
        expect(mismaListaFrecuente(FRECUENTES, [FRECUENTES[1], FRECUENTES[0]])).toBe(false);
        expect(mismaListaFrecuente(FRECUENTES, [{ ...FRECUENTES[0], veces: 2 }, FRECUENTES[1]])).toBe(false);
        expect(mismaListaFrecuente([], FRECUENTES)).toBe(false);
    });
});

describe('«Lo que más registras» al abrir la hoja', () => {
    it('con caché sale AL INSTANTE, sin esperar al servidor', () => {
        writeFrequentFoodsCache('u1', FRECUENTES);
        render(<LogMealModal onClose={() => {}} userId="u1" />);
        expect(screen.getByText('Mangú con huevo')).toBeInTheDocument();
        expect(screen.getByText('Yuca con pollo')).toBeInTheDocument();
    });
    it('lo que traiga el servidor sustituye a lo recordado y queda guardado para la próxima', async () => {
        writeFrequentFoodsCache('u1', FRECUENTES);
        const nuevas = [{ last_meal_id: 'f9', meal_name: 'Avena con guineo', kcal: 410, veces: 5 }];
        frecuentesDelServidor = async () => respuesta({ items: nuevas });
        render(<LogMealModal onClose={() => {}} userId="u1" />);
        await waitFor(() => expect(screen.getByText('Avena con guineo')).toBeInTheDocument());
        expect(screen.queryByText('Mangú con huevo')).toBeNull();
        expect(readFrequentFoodsCache('u1')).toEqual(nuevas);
    });
    it('un fallo del servidor NO borra la lista recordada', async () => {
        writeFrequentFoodsCache('u1', FRECUENTES);
        frecuentesDelServidor = async () => respuesta({}, false);
        render(<LogMealModal onClose={() => {}} userId="u1" />);
        await new Promise((r) => setTimeout(r, 30));
        expect(screen.getByText('Mangú con huevo')).toBeInTheDocument();
        expect(readFrequentFoodsCache('u1')).toEqual(FRECUENTES);
    });
    it('sin `userId` del padre usa el usuario que la app recuerda; un invitado no tiene lista', () => {
        writeFrequentFoodsCache('u7', FRECUENTES);
        localStorage.setItem('mealfit_user_id', 'u7');
        const { unmount } = render(<LogMealModal onClose={() => {}} />);
        expect(screen.getByText('Mangú con huevo')).toBeInTheDocument();
        unmount();
        localStorage.setItem('mealfit_user_id', 'guest');
        writeFrequentFoodsCache('guest', FRECUENTES);
        render(<LogMealModal onClose={() => {}} />);
        expect(screen.queryByText('Mangú con huevo')).toBeNull();
    });
});

describe('el escáner desde «Ver días anteriores»', () => {
    it('el diario le da `onScan` al componedor y monta el escáner en el día que se mira', () => {
        const dh = leer('components/dashboard/DiaryHistory.jsx');
        expect(dh).toContain('<LogMealModal onClose={cerrarComponedor} onScan={pasarAlEscaner} initialDaysAgo={atras} userId={userId} />');
        expect(dh).toContain("<ScanMealModal isOpen onClose={cerrarEscaner} userId={userId || 'guest'} initialDaysAgo={atras} />");
        expect(dh).toContain('const pasarAlEscaner = useCallback(() => { setRegistrando(false); setEscaneando(true); }, []);');
        // con cualquiera de las dos hojas encima, las teclas son suyas
        expect(dh).toContain('if (registrando || escaneando) return;');
    });
    it('con `onScan` el componedor pinta «Escanear con foto»; sin él, no', () => {
        const { unmount } = render(<LogMealModal onClose={() => {}} onScan={() => {}} />);
        expect(screen.getByRole('button', { name: 'Escanear con foto' })).toBeInTheDocument();
        unmount();
        render(<LogMealModal onClose={() => {}} />);
        expect(screen.queryByRole('button', { name: 'Escanear con foto' })).toBeNull();
    });
    it('el escáner nace en el día pedido, con su chip, y el aviso no llama «antier» a hace cinco días', () => {
        const sm = leer('components/dashboard/ScanMealModal.jsx');
        expect(sm).toContain('const ScanMealModal = ({ isOpen, onClose, userId, initialDaysAgo = 0 }) => {');
        expect(sm).toContain('useState(() => normalizarDiasAtras(initialDaysAgo));');
        expect(sm).toContain('options={_getDayOptionsCon(t, initialDaysAgo)} value={daysAgo} onChange={setDaysAgo}');
        expect(sm).toContain('const dia = nombreDelDiaAtras(t, daysAgo);');
    });
    it('los chips del día: un solo sitio para el componedor y el escáner', () => {
        const t = (s) => s;
        expect(getDayOptionsCon(t, 0).map((o) => o.value)).toEqual([0, 1, 2]);
        expect(getDayOptionsCon(t, 2).map((o) => o.value)).toEqual([0, 1, 2]);
        expect(getDayOptionsCon(t, 5).map((o) => o.value)).toEqual([0, 1, 2, 5]);
        expect(getDayOptionsCon(t, 9).map((o) => o.value)).toEqual([0, 1, 2]);
        expect(normalizarDiasAtras(12)).toBe(7);
        expect(normalizarDiasAtras(-3)).toBe(0);
        expect(normalizarDiasAtras('x')).toBe(0);
        expect(nombreDelDiaAtras(t, 1)).toBe('ayer');
        expect(nombreDelDiaAtras(t, 2)).toBe('antier');
        expect(nombreDelDiaAtras(t, 5)).not.toBe('antier');
        const lm = leer('components/dashboard/LogMealModal.jsx');
        expect(lm).toContain("import { getDayOptionsCon as _getDayOptionsCon } from './dayOptions';");
        expect(lm).not.toContain('const _getDayOptions = (t) => [');
    });
});
