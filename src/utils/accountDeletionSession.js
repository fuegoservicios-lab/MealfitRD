// La cuenta se invalida a propósito al borrarla. Los polls que estaban en vuelo
// pueden devolver 401 incluso después del logout o de entrar con otra cuenta.
let generation = 0;
let pendingDeletions = 0;

export const sessionRequestGeneration = () => generation;

export function beginAccountDeletion() {
    pendingDeletions += 1;
    generation += 1;
    let ended = false;
    return () => {
        if (ended) return;
        ended = true;
        pendingDeletions -= 1;
        generation += 1;
    };
}

export function shouldSignalSessionExpiry(requestGeneration, url) {
    // Un 401 del propio borrado sigue siendo un error real de autenticación.
    if (/\/api\/account\/delete(?:[?#]|$)/.test(url)) return true;
    return pendingDeletions === 0 && requestGeneration === generation;
}
