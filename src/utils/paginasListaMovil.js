/** Paginate the measured shopping template before rasterizing it, keeping each item intact. */
export const ALTO_PAGINA_LISTA = 720;
export const ANCHO_PAGINA_LISTA = 400;

export function paginarListaMovil(element, host) {
    const fuente = element.firstElementChild.cloneNode(true);
    fuente.style.cssText += 'width:400px;box-sizing:border-box;padding:16px;font-size:14px;overflow-wrap:anywhere;';
    fuente.querySelectorAll('[style]').forEach((n) => {
        const tam = parseFloat(n.style.fontSize);
        if (tam > 0 && tam < 15) n.style.fontSize = '15px';
        if (n.style.lineHeight && parseFloat(n.style.lineHeight) < 1.35) n.style.lineHeight = '1.4';
        if (n.style.columnCount) n.style.columnCount = '1';
    });
    fuente.querySelectorAll('li').forEach((li) => {
        li.style.padding = '10px';
        const nombre = li.querySelector('span');
        if (nombre) nombre.style.fontSize = '18px';
        const contenido = li.children[1];
        if (contenido) {
            contenido.style.flexDirection = 'column'; contenido.style.gap = '6px'; contenido.style.minWidth = '0';
            const cantidades = contenido.children[1];
            if (cantidades) {
                cantidades.style.flexDirection = 'row'; cantidades.style.flexWrap = 'wrap';
                cantidades.style.alignItems = 'center'; cantidades.style.gap = '6px';
            }
        }
    });
    const encabezado = fuente.firstElementChild;
    if (encabezado) { encabezado.style.flexWrap = 'wrap'; encabezado.style.gap = '12px'; }
    const paginas = [];
    let pagina;
    const nueva = () => {
        pagina = fuente.cloneNode(false);
        pagina.style.paddingBottom = '44px';
        host.appendChild(pagina);
        paginas.push(pagina);
    };
    const desborda = () => pagina.scrollHeight > ALTO_PAGINA_LISTA;
    nueva();
    const agregar = (bloque) => {
        pagina.appendChild(bloque);
        if (desborda() && pagina.children.length > 1) {
            bloque.remove(); nueva(); pagina.appendChild(bloque);
        }
    };
    const categoria = (original) => {
        let tarjeta;
        let lista;
        const abrir = () => {
            tarjeta = original.cloneNode(true);
            tarjeta.style.display = 'block';
            lista = tarjeta.querySelector('ul');
            lista.replaceChildren();
            agregar(tarjeta);
        };
        abrir();
        for (const originalFila of original.querySelectorAll('ul > li')) {
            const fila = originalFila.cloneNode(true);
            lista.appendChild(fila);
            if (desborda() && (lista.children.length > 1 || pagina.children.length > 1)) {
                fila.remove();
                if (!lista.children.length) tarjeta.remove();
                nueva(); abrir(); lista.appendChild(fila);
            }
        }
    };
    for (const bloque of fuente.children) {
        const categorias = [...bloque.querySelectorAll('[data-lista-categoria]')];
        if (bloque.matches('[data-lista-categoria]')) categoria(bloque);
        else if (categorias.length) categorias.forEach(categoria);
        else agregar(bloque.cloneNode(true));
    }
    return paginas.filter((p) => p.children.length).map((p, i, todas) => {
        // Each image has a stable short portrait shape, with page numbers that survive sharing.
        const alto = Math.max(480, p.scrollHeight);
        p.style.position = 'relative'; p.style.height = `${alto}px`;
        const pie = document.createElement('div');
        pie.textContent = `${i + 1} / ${todas.length}`;
        pie.style.cssText = 'position:absolute;bottom:14px;left:16px;right:16px;text-align:center;font-size:14px;color:#64748b;';
        p.appendChild(pie);
        return p;
    });
}
