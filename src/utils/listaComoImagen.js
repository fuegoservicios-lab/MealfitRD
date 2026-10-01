// [P1-PLAN-LOTE-927 · 2026-09-30] En el teléfono la lista de compras sale como IMAGEN, no como PDF.
//
// El PDF está pensado para una hoja A4: con muchas líneas baja la letra a 6,5-8 px para que quepa en una página
// (`computePdfLayoutDensity`), y en un teléfono se abre en un visor donde hay que hacer zoom para leerla. El dueño lo
// pidió: «si es mejor quiero que sea una imagen lo de la lista de compras móvil». En el teléfono la MISMA plantilla se
// dibuja en una columna con letra cómoda, dividida en páginas cortas que se previsualizan antes de compartir.
// Cada página se comparte con la hoja del sistema (app nativa: Share + Filesystem; web: Web Share) o se descarga.
// El escritorio sigue con el PDF.
import { archivoDeImagen, compartir, puedeCompartirImagenes, puedeCompartirNativo } from './compartirDia';
import { isNativeApp } from '../config/platform';
import { t } from '../i18n';
import { paginarListaMovil } from './paginasListaMovil';

/** Ancho CSS del dibujo: el de un teléfono, para que la letra de la plantilla se lea a tamaño real. */
export const ANCHO_IMAGEN_PX = 400;

/** La densidad «cómoda» de la plantilla: una columna, sin apretar la letra para caber en una hoja. */
export const LAYOUT_IMAGEN_MOVIL = Object.freeze({
    density: 'imagen-movil',
    isDense: false,
    isUltraDense: false,
    isHyperDense: false,
    multiPage: true,
    columnCount: 1,
    showInventoryNotes: true,
});

/** ¿Imagen en vez de PDF? En la app nativa y en pantallas de teléfono. */
export function esImagenMovil() {
    try {
        if (isNativeApp()) return true;
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            && window.matchMedia('(max-width: 768px)').matches;
    } catch {
        return false;
    }
}

const _blobDe = (canvas) => new Promise((resolve, reject) => {
    try {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob vacío'))), 'image/png');
    } catch (e) {
        reject(e);
    }
});

function _descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
}

/** Prepare short readable images. Sharing happens later, from a fresh tap in the preview. */
export async function guardarListaComoImagen({ html2pdf, element, nombre = 'lista-de-compras.png', signal }) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;width:400px;pointer-events:none;';
    document.body.appendChild(host);
    const comprobar = () => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
    try {
        if (document.fonts?.ready) await document.fonts.ready;
        comprobar();
        const paginas = paginarListaMovil(element, host);
        const imagenes = [];
        for (const [i, pagina] of paginas.entries()) {
            comprobar();
            const canvas = await html2pdf()
                .set({ margin: 0, jsPDF: { unit: 'px', format: [ANCHO_IMAGEN_PX, pagina.scrollHeight],
                    orientation: 'portrait', hotfixes: ['px_scaling'] },
                    html2canvas: { scale: 2, useCORS: true, windowWidth: ANCHO_IMAGEN_PX }, pagebreak: { mode: [] } })
                .from(pagina).toCanvas().get('canvas');
            try {
                const blob = await _blobDe(canvas);
                comprobar();
                imagenes.push({ blob, nombre: paginas.length > 1
                    ? nombre.replace(/\.png$/i, '') + `-${i + 1}-${paginas.length}.png` : nombre });
            } finally { canvas.width = 0; canvas.height = 0; }
        }
        return imagenes;
    } finally { host.remove(); }
}

/** Share one prepared page; cancellation keeps the preview, unsupported sharing downloads the image. */
export async function guardarPaginaLista({ blob, nombre }) {
    const r = await compartir({
        archivo: archivoDeImagen(blob, nombre), texto: '',
        titulo: t('Lista de compras'), tituloHoja: t('Guardar o compartir tu lista'),
    });
    if (r === 'compartido' || r === 'cancelado') return r;
    _descargar(blob, nombre);
    return 'descargado';
}

export function puedeCompartirLista(imagenes) {
    return puedeCompartirNativo() || puedeCompartirImagenes(imagenes.map(({ blob, nombre }) => archivoDeImagen(blob, nombre)));
}

export function compartirPaginasLista(imagenes) {
    const archivos = imagenes.map(({ blob, nombre }) => archivoDeImagen(blob, nombre));
    if (!archivos.length || !archivos.every(Boolean)) return Promise.resolve('fallo');
    return compartir({ archivos, texto: '', titulo: t('Lista de compras'), tituloHoja: t('Guardar o compartir tu lista') });
}

export function descargarPaginaLista({ blob, nombre }) { _descargar(blob, nombre); }
