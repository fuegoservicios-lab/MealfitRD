// [P3-AJI-MORRON-DISPLAY · 2026-06-22] Terminología RD para la lista de
// ingredientes: el pimiento dulce (campana / rojo / verde / amarillo / morrón)
// se conoce coloquialmente en RD como "ají morrón". Renombra SOLO ese término
// en el texto del INGREDIENTE mostrado (pedido del owner: "que diga ají morrón").
//
// Conservador a propósito — NO toca:
//   - "pimienta"  → \bpimiento\b no matchea (palabra distinta; pimienta negra).
//   - "pimentón" / paprika (la especia) → no matchea \bpimiento\b.
//   - "ají cubanela (pimiento verde)" → si el string menciona "cubanela" se
//     devuelve intacto: el "(pimiento verde)" aclara el cubanela, que es OTRO
//     ají; renombrarlo sería incorrecto (decisión del owner: "no toca el cubanela").
//
// Se aplica solo a strings de INGREDIENTE estructurado, NO a pasos de receta,
// donde "los pimientos" puede referirse al plato (ambiguo) y renombrarlo daría
// gramática rota ("rellena los ají morrón").
export function displayAjiMorron(text) {
    if (!text || typeof text !== 'string') return text;
    if (/cubanela/i.test(text)) return text;
    return text.replace(
        /\b(pimientos?)\b(\s+(rojos?|verdes?|amarillos?|dulces?|morrones?|morr[oó]n))?/gi,
        (_m, p1) => (p1[0] === p1[0].toUpperCase() ? 'Ají morrón' : 'ají morrón')
    );
}
