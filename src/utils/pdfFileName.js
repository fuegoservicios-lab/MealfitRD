// [P3-I18N-PDF-NOMBRE-ARCHIVO · 2026-08-22] El nombre del fichero que se descarga.
//
// Los dos PDF lo componian igual: un prefijo español FIJO pegado a partes que sí se
// traducen. Un usuario en inglés recibía `Lista_de_compras_7_days_2026-08-22_ab12cd34.pdf`
// —mitad y mitad— y en la carpeta de Descargas ese nombre es lo ÚNICO que distingue un
// documento de otro.
//
// El saneado no es cosmético: un nombre de fichero no admite `/ \ : * ? " < > |`, y el copy
// traducido sí puede traerlos (fr-FR usa `:` con espacio fino, y varios idiomas meten
// comas). Se quitan además los diacríticos, para que el nombre viaje igual entre sistemas
// de ficheros — es el mismo criterio ASCII que ya seguían los dos nombres actuales.
//
// NO se sanea el `plan_id` ni la fecha: son identificadores y ya vienen limpios.

/**
 * `pdfFileName(...partes)` -> string
 *
 * Une las partes con `_`, sin acentos ni caracteres prohibidos, y añade `.pdf`.
 * Las partes vacías, nulas o que se quedan en nada tras sanear se descartan: mejor un
 * nombre más corto que uno con `__` en medio.
 */
export const pdfFileName = (...partes) => {
    const limpias = partes
        .filter((p) => p !== null && p !== undefined)
        .map((p) =>
            String(p)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^A-Za-z0-9.-]+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^[_.-]+|[_.-]+$/g, ''),
        )
        .filter((p) => p !== '');
    return `${limpias.join('_') || 'documento'}.pdf`;
};
