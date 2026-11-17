// [P1-PLAN-LOTE-1064 · 2026-11-17] Decisión del dueño: los emojis que hacían de iconos en el chat pasan a lucide.
// El mensaje guarda solo un NOMBRE (serializable: los errores viven en el estado del chat), y aquí se pinta.
import {
    Package, ImageOff, Image as ImageIcon, Clock, Hourglass, Lock, RefreshCw, KeyRound, WifiOff,
    AlertTriangle, Dumbbell, Lightbulb, ChefHat,
} from 'lucide-react';

const ICONOS = {
    paquete: Package,
    imagen_rota: ImageOff,
    imagen: ImageIcon,
    reloj: Clock,
    espera: Hourglass,
    candado: Lock,
    recargar: RefreshCw,
    sesion: KeyRound,
    sin_red: WifiOff,
    aviso: AlertTriangle,
    proteina: Dumbbell,
    idea: Lightbulb, // sin Sparkles: nada de destello tipo Gemini (lote 1049)
    receta: ChefHat,
};

export function IconoDelChat({ nombre, size = 16, ...resto }) {
    const Icono = ICONOS[nombre];
    if (!Icono) return null;
    return <Icono size={size} strokeWidth={2} aria-hidden="true" focusable="false" {...resto} />;
}

export default IconoDelChat;
