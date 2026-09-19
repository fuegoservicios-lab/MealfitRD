// [P1-PLAN-LOTE-117] `<img>` de las fotos del chat: la carga (directa o autenticada) vive en hooks/useChatImageSrc.js.
import { useEffect, useState } from 'react';
import { useChatImageSrc } from '../../hooks/useChatImageSrc';
import { useStableCallback } from '../../hooks/useStableCallback';

/**
 * `<img>` del chat. `onBroken` avisa cuando la foto se da por perdida (para pintar «Imagen no disponible»).
 *
 * [P1-PLAN-LOTE-123 · 2026-09-19] RELEVO SIN HUECO. Al terminar la subida, la burbuja cambia la miniatura local por
 * la foto del servidor. Si el `<img>` cambia de `src` a pelo (o, en la app nativa, se queda sin `src` mientras llega
 * el blob autenticado) hay un instante sin imagen. Con una foto YA pintada, la nueva se precarga fuera del DOM y solo
 * sustituye a la vieja cuando está lista; la primera carga va directa, como siempre.
 */
export function ChatImage({ url, alt, onBroken, ...rest }) {
    const { src, onError, definitivo } = useChatImageSrc(url);
    const [pintado, setPintado] = useState(null); // el último src que llegó a verse
    const alFallarLaPrecarga = useStableCallback(() => onError?.());
    useEffect(() => { if (definitivo) onBroken?.(); }, [definitivo, onBroken]);
    useEffect(() => {
        if (!src || !pintado || src === pintado || typeof Image === 'undefined') return undefined;
        let vivo = true;
        const pre = new Image();
        pre.onload = () => { if (vivo) setPintado(src); };
        pre.onerror = () => { if (vivo) alFallarLaPrecarga(); };
        pre.src = src;
        return () => { vivo = false; pre.onload = null; pre.onerror = null; };
    }, [src, pintado, alFallarLaPrecarga]);
    const visible = pintado || src;
    if (!visible) return <span className="message-media-loading" aria-hidden="true" />;
    return (
        <img
            src={visible}
            alt={alt}
            onError={pintado ? undefined : onError}
            onLoad={() => { if (!pintado) setPintado(visible); }}
            {...rest}
        />
    );
}
