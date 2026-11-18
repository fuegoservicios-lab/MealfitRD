// [P1-PLAN-LOTE-1072 · 2026-11-17] Las fechas del periodo del informe tal como las calcula el servidor
// (`informe_medico.py`): `hasta` = hoy, `desde` = hoy − (n − 1). Para enseñarlas ANTES de generar.
const _iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function fechasDelPeriodo(n, hoy = new Date()) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const desde = new Date(d);
    desde.setDate(d.getDate() - (n - 1));
    return { desde: _iso(desde), hasta: _iso(d) };
}
