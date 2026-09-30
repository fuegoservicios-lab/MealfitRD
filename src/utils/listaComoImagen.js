// [P1-PLAN-LOTE-927 · 2026-09-30] En el teléfono la lista de compras sale como IMAGEN, no como PDF.
//
// El PDF está pensado para una hoja A4: con muchas líneas baja la letra a 6,5-8 px para que quepa en una página
// (`computePdfLayoutDensity`), y en un teléfono se abre en un visor donde hay que hacer zoom para leerla. El dueño lo
// pidió: «si es mejor quiero que sea una imagen lo de la lista de compras móvil». En el teléfono la MISMA plantilla se
// dibuja en una columna, con la letra cómoda y sin límite de alto (una imagen larga se desliza en la galería), y se
// comparte con la hoja del sistema (app nativa: plugins Share + Filesystem; web: Web Share) o se descarga.
// El escritorio sigue con el PDF.
import { archivoDeImagen, compartir } from './compartirDia';
import { isNativeApp } from '../config/platform';
import { t } from '../i18n';

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

/**
 * Dibuja `element` (la plantilla de la lista) como PNG y lo comparte; si no se puede compartir, lo descarga.
 * Devuelve 'compartido' | 'cancelado' | 'descargado'. Lanza si el dibujo falla (el llamador ya muestra el error).
 */
export async function guardarListaComoImagen({ html2pdf, element, nombre = 'lista-de-compras.png' }) {
    element.style.width = `${ANCHO_IMAGEN_PX}px`;
    const canvas = await html2pdf()
        .set({ html2canvas: { scale: 3, useCORS: true, windowWidth: ANCHO_IMAGEN_PX } })
        .from(element)
        .toCanvas()
        .get('canvas');
    const blob = await _blobDe(canvas);
    const r = await compartir({
        archivo: archivoDeImagen(blob, nombre), texto: '',
        titulo: t('Lista de compras'), tituloHoja: t('Guardar o compartir tu lista'),
    });
    if (r === 'compartido' || r === 'cancelado') return r;
    _descargar(blob, nombre);
    return 'descargado';
}
