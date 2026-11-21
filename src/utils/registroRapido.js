// [P1-PLAN-LOTE-1147 · 2026-11-21] La parte pura de la hoja «Registrar comida» rehecha («una caja que hace las dos
// cosas»): qué comida es por la hora, si lo escrito es una FRASE (entonces se ofrece «Calcular todo») y cuánto mueven
// los botones − / + de cada línea del plato (nadie tiene que teclear números para lo habitual).

/** La comida que toca a esta hora local, o null (de madrugada: «Extra»). */
export function comidaPorHora(fecha = new Date()) {
    const h = fecha.getHours();
    if (h >= 5 && h < 11) return 'desayuno';
    if (h >= 11 && h < 16) return 'almuerzo';
    if (h >= 16 && h < 19) return 'merienda';
    if (h >= 19 && h < 23) return 'cena';
    return null;
}

/** ¿Lo escrito describe un plato entero («arroz con pollo», «arroz, habichuelas») y no un alimento suelto? */
export function pareceFrase(texto) {
    const s = String(texto || '').trim().toLowerCase();
    if (s.length < 3) return false;
    if (/[,;+]/.test(s) || /\s(y|con|e|and|with|com|avec|et|con)\s/.test(` ${s} `)) return true;
    return s.split(/\s+/).filter((p) => p.replace(/[^\p{L}\d]/gu, '').length >= 2).length >= 3;
}

const _redondo = (n) => Math.round(n * 10) / 10;

/** La cantidad tras tocar − (dir −1) o + (dir 1): en gramos/ml de 25 en 25 (mínimo 5); en piezas, de ½ en ½ hasta 2
 *  y luego de 1 en 1 (mínimo ½). Nunca baja de su mínimo. */
export function pasoDeCantidad(unidad, qty, dir) {
    const q = Number(qty) || 0;
    const peso = /^(g|ml|gr|gramos?)$/i.test(String(unidad || ''));
    if (peso) {
        const paso = 25;
        const sig = dir > 0 ? Math.floor(q / paso) * paso + paso : Math.ceil(q / paso) * paso - paso;
        return Math.max(5, sig);
    }
    const paso = (dir > 0 ? q : q - 0.01) < 2 ? 0.5 : 1;
    return Math.max(0.5, _redondo(q + dir * paso));
}
