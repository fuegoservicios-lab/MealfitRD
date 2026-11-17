// [P1-PLAN-LOTE-1064 · 2026-11-17] Decisión del dueño: los avisos (sonner) llevan iconos lucide, no emojis.
// Uso: toast.success(texto, { icon: iconoDeAviso('nevera') }).
import {
    ChefHat, Crown, ShoppingCart, Trash2, Undo2, CircleCheck, AlertTriangle, FileText, Package, Heart,
} from 'lucide-react';

const ICONOS = {
    chef: ChefHat,
    premium: Crown, // sin Sparkles (lote 1049)
    compras: ShoppingCart,
    borrado: Trash2,
    deshacer: Undo2,
    hecho: CircleCheck,
    aviso: AlertTriangle,
    pdf: FileText,
    nevera: Package,
    gusta: Heart,
};

export function iconoDeAviso(nombre) {
    const Icono = ICONOS[nombre];
    return Icono ? <Icono size={18} strokeWidth={2.25} aria-hidden="true" focusable="false" /> : undefined;
}

export default iconoDeAviso;
