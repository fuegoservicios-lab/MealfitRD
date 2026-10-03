import { useRef } from 'react';

// En móvil, enviar puede ejecutarse en pointerdown. El click de ese mismo
// gesto llega después, cuando este botón ya ocupa el lugar de Enviar.
// Solo un gesto que empezó sobre Detener puede cancelar la respuesta.
export function ChatStopButton({ onStop, children, ...props }) {
    const pointerStartedHere = useRef(false);
    return (
        <button
            {...props}
            type="button"
            onPointerDown={(event) => {
                pointerStartedHere.current = event.button === 0;
            }}
            onPointerCancel={() => { pointerStartedHere.current = false; }}
            onBlur={() => { pointerStartedHere.current = false; }}
            onClick={(event) => {
                const deliberatePointer = pointerStartedHere.current;
                pointerStartedHere.current = false;
                // Enter, espacio y tecnologías de asistencia activan con detail=0.
                if (event.detail !== 0 && !deliberatePointer) return;
                onStop();
            }}
        >
            {children}
        </button>
    );
}
