// [P2-LOGOUT-IDENTITY-CARD · 2026-09-03] Iniciales para un avatar: primera letra del nombre y
// del apellido; sin nombre, la del correo; sin nada, «?». Vive fuera del componente porque un
// export extra en un archivo de componente rompe Fast Refresh (y suma un warning al gate).
export function initialsFor(name, email) {
    const src = (name || '').trim();
    if (src) {
        const parts = src.split(/\s+/).filter(Boolean);
        const first = parts[0]?.[0] || '';
        const last = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
        return (first + last).toUpperCase();
    }
    const e = (email || '').trim();
    return e ? e[0].toUpperCase() : '?';
}
