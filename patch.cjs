const fs = require('fs');
let b = fs.readFileSync('../backend/prompts.py', 'utf8');
const search = '    - Exactitud sin Alucinaciones: Los números deben ser matemáticamente lógicos y exactos. ESTO ES CRÍTICO para que nuestro algoritmo de lista de compras no falle.';
const replace = search + '\n    - INTEGRIDAD DE INGREDIENTES: TODO alimento mencionado en la receta, y cada "topping" u adorno (Especialmente las FRUTAS como las fresas, manzana, siropes) DEBEN estar listados OBLIGATORIAMENTE en el arreglo de \'ingredients\'. ¡Nunca asumas que un ingrediente se sobreentiende!';
if(b.includes(search)) {
    fs.writeFileSync('../backend/prompts.py', b.replace(search, replace));
    console.log("Success");
} else {
    console.log("Not found");
}
