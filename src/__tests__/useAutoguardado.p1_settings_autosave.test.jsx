// [P1-SETTINGS-AUTOSAVE · 2026-08-11] El hook que sustituye a los botones «Guardar».
//
// Se prueba AQUÍ y no solo en los paneles porque es donde vive el riesgo: quitar un
// botón mueve la decisión de guardar desde el dedo del usuario hasta un temporizador,
// y a partir de ahí cualquier descuido es pérdida de datos silenciosa.
//
// Las nueve situaciones de abajo NO son una lista de features: son las formas
// concretas en que este cambio puede perder o corromper datos, cada una con su
// mecanismo. Si añades una velocidad o tocas el diff, empieza por romper una de estas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useAutoguardado, { RETARDO_INSTANTANEO_MS, RETARDO_NORMAL_MS, claveEstable } from '../hooks/useAutoguardado';

const montar = (props) => renderHook((p) => useAutoguardado(p), { initialProps: props });

describe('[P1-SETTINGS-AUTOSAVE] claveEstable', () => {
    it('no depende del orden de las claves', () => {
        // Si dependiera, el diff inventaría cambios — y un cambio inventado en
        // `freeText` es una llamada al modelo que nadie pidió.
        expect(claveEstable({ a: 1, b: [1, { x: 1, y: 2 }] }))
            .toBe(claveEstable({ b: [1, { y: 2, x: 1 }], a: 1 }));
    });

    it('distingue lo que de verdad es distinto', () => {
        expect(claveEstable({ a: 1 })).not.toBe(claveEstable({ a: 2 }));
        expect(claveEstable([1, 2])).not.toBe(claveEstable([2, 1]));
        expect(claveEstable('')).not.toBe(claveEstable(null));
    });
});

describe('[P1-SETTINGS-AUTOSAVE] sin lectura previa no hay escritura', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('con habilitado=false no guarda NUNCA, por mucho que cambie', () => {
        // El cierre de P2-SUPERPERS-FAIL-CLOSED y P1-CLINICAL-FAIL-CLOSED movido a la
        // capa que ahora dispara: si la carga falló, el panel está vacío y escribir
        // ese vacío borraría los datos reales.
        const guardar = vi.fn().mockResolvedValue(undefined);
        const { rerender } = montar({ valor: { a: 1 }, guardar, habilitado: false });
        rerender({ valor: { a: 2 }, guardar, habilitado: false });
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(guardar).not.toHaveBeenCalled();
    });

    it('si la carga se cae DESPUÉS, suelta el permiso y deja de escribir', () => {
        // Un reintento fallido no puede dejar viva la base de la carga anterior.
        const guardar = vi.fn().mockResolvedValue(undefined);
        const { rerender } = montar({ valor: { a: 1 }, guardar, habilitado: true });
        rerender({ valor: { a: 1 }, guardar, habilitado: false });
        rerender({ valor: { a: 99 }, guardar, habilitado: false });
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(guardar).not.toHaveBeenCalled();
    });

    it('un volcado EXPLÍCITO sobre un panel sin cargar tampoco escribe', () => {
        // ESTE CASO SALIÓ DE UNA MUTACIÓN, y la conclusión no fue la que esperaba.
        // Al quitar el `if (!baseRef.current) return` de `transmitir`, las pruebas
        // seguían verdes. Mi primera lectura fue «hay un hueco»; la correcta es que esa
        // línea es REDUNDANTE — `cambiadas()` ya devuelve vacío sin base, así que la
        // protección vive ahí. La guarda se queda por legibilidad, no por función.
        //
        // El caso igualmente hace falta: el temporizador no es la única vía de escritura.
        // `volcar()` lo llaman el `onBlur` de los textarea, el desmontaje y `pagehide`,
        // y ninguna pasa por el programador. Esto ancla la PROPIEDAD en esas entradas,
        // sea cual sea la línea concreta que la sostenga mañana.
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: false, instantaneos: ['a'] };
        const { rerender, result } = montar({ ...base, valor: { a: 1 } });
        rerender({ ...base, valor: { a: 2 } });
        act(() => { result.current.volcar(); });
        expect(guardar, 'un volcado directo escribió sin que la carga hubiera terminado').not.toHaveBeenCalled();
    });

    it('desmontar un panel que nunca cargó tampoco escribe', () => {
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: false, instantaneos: ['a'] };
        const { rerender, unmount } = montar({ ...base, valor: { a: 1 } });
        rerender({ ...base, valor: { a: 2 } });
        unmount();
        expect(guardar).not.toHaveBeenCalled();
    });

    it('el primer render tras habilitar NO guarda: nada ha cambiado todavía', () => {
        const guardar = vi.fn().mockResolvedValue(undefined);
        montar({ valor: { a: 1 }, guardar, habilitado: true });
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(guardar).not.toHaveBeenCalled();
    });
});

describe('[P1-SETTINGS-AUTOSAVE] las tres velocidades', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('un chip declarado instantáneo sale a los 400 ms', () => {
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, instantaneos: ['chips'] };
        const { rerender } = montar({ ...base, valor: { chips: [] } });
        rerender({ ...base, valor: { chips: ['reflujo'] } });

        act(() => { vi.advanceTimersByTime(RETARDO_INSTANTANEO_MS - 50); });
        expect(guardar).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(60); });
        expect(guardar).toHaveBeenCalledTimes(1);
    });

    it('un campo sin declarar cae en la velocidad LENTA, no en la rápida', () => {
        // La asimetría es deliberada: si alguien añade un campo y olvida declararlo,
        // que el coste sea esperar 1,2 s y no una ráfaga de llamadas al modelo.
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, instantaneos: ['chips'] };
        const { rerender } = montar({ ...base, valor: { nuevo: '' } });
        rerender({ ...base, valor: { nuevo: '9' } });

        act(() => { vi.advanceTimersByTime(RETARDO_INSTANTANEO_MS + 100); });
        expect(guardar, 'un campo sin clasificar se guardó a velocidad de chip').not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(RETARDO_NORMAL_MS); });
        expect(guardar).toHaveBeenCalledTimes(1);
    });

    it('una ráfaga de clics sale como UN solo PUT', () => {
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, instantaneos: ['chips'] };
        const { rerender } = montar({ ...base, valor: { chips: [] } });
        for (const v of [['a'], ['a', 'b'], ['a', 'b', 'c']]) {
            rerender({ ...base, valor: { chips: v } });
            act(() => { vi.advanceTimersByTime(100); });
        }
        act(() => { vi.advanceTimersByTime(RETARDO_INSTANTANEO_MS); });
        expect(guardar).toHaveBeenCalledTimes(1);
        expect(guardar.mock.calls[0][0]).toEqual({ chips: ['a', 'b', 'c'] });
    });

    it('EL TEXTO LIBRE no sale por temporizador — cuesta una llamada al modelo', () => {
        // `async_extract_and_save_facts` (user_data.py:986 y :1197) corre en CADA PUT
        // con `freeText` cambiado. Un temporizador al teclear sería una extracción por
        // pausa dentro del párrafo.
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, alVolcar: ['freeText'] };
        const { rerender, result } = montar({ ...base, valor: { freeText: '' } });
        rerender({ ...base, valor: { freeText: 'Trabajo de noche' } });

        act(() => { vi.advanceTimersByTime(120_000); });
        expect(guardar, 'el texto libre se guardó solo: eso es una llamada al modelo por pausa').not.toHaveBeenCalled();

        act(() => { result.current.volcar(); });
        expect(guardar).toHaveBeenCalledTimes(1);
        expect(guardar.mock.calls[0][0]).toEqual({ freeText: 'Trabajo de noche' });
    });

    it('si cambian a la vez un chip y el texto, viajan JUNTOS al tocar el chip', () => {
        // El PUT manda el objeto entero, así que el texto pendiente se lleva de arrastre.
        // Es correcto y conviene saberlo: no se pierde por ser diferido.
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, instantaneos: ['chips'], alVolcar: ['freeText'] };
        const { rerender } = montar({ ...base, valor: { chips: [], freeText: '' } });
        rerender({ ...base, valor: { chips: [], freeText: 'hola' } });
        act(() => { vi.advanceTimersByTime(5_000); });
        expect(guardar).not.toHaveBeenCalled();

        rerender({ ...base, valor: { chips: ['x'], freeText: 'hola' } });
        act(() => { vi.advanceTimersByTime(RETARDO_INSTANTANEO_MS + 50); });
        expect(guardar).toHaveBeenCalledTimes(1);
        expect(guardar.mock.calls[0][0]).toEqual({ chips: ['x'], freeText: 'hola' });
    });
});

describe('[P1-SETTINGS-AUTOSAVE] nunca dos PUT en vuelo', () => {
    it('el segundo espera al primero, y gana el ÚLTIMO valor', async () => {
        // Los endpoints REEMPLAZAN la sub-clave entera: dos respuestas fuera de orden
        // no son un detalle de carrera, son el cuerpo viejo pisando al nuevo.
        let resolver;
        const guardar = vi.fn()
            .mockImplementationOnce(() => new Promise((r) => { resolver = () => r(undefined); }))
            .mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, instantaneos: ['n'] };
        const { rerender, result } = montar({ ...base, valor: { n: 0 } });

        rerender({ ...base, valor: { n: 1 } });
        act(() => { result.current.volcar(); });
        await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));

        // Mientras el primero sigue en vuelo, llegan dos cambios más.
        rerender({ ...base, valor: { n: 2 } });
        rerender({ ...base, valor: { n: 3 } });
        act(() => { result.current.volcar(); });
        expect(guardar, 'salió un segundo PUT con el primero aún en vuelo').toHaveBeenCalledTimes(1);

        await act(async () => { resolver(); });
        await waitFor(() => expect(guardar).toHaveBeenCalledTimes(2));
        expect(guardar.mock.calls[1][0]).toEqual({ n: 3 });
    });
});

describe('[P1-SETTINGS-AUTOSAVE] borrar a propósito sí se guarda', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('vaciar un campo cargado es un cambio legítimo y viaja', () => {
        // La distinción con «guardar sobre vacío»: el diff es contra la BASE CARGADA,
        // no contra el vacío. Un panel que nunca cargó no tiene base y no escribe;
        // uno que cargó «hola» y ahora dice «» sí ha cambiado.
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, instantaneos: ['t'] };
        const { rerender } = montar({ ...base, valor: { t: 'hola' } });
        rerender({ ...base, valor: { t: '' } });
        act(() => { vi.advanceTimersByTime(RETARDO_INSTANTANEO_MS + 50); });
        expect(guardar).toHaveBeenCalledTimes(1);
        expect(guardar.mock.calls[0][0]).toEqual({ t: '' });
    });
});

describe('[P1-SETTINGS-AUTOSAVE] al desmontar no se pierde nada', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('cerrar la ventana con un cambio a medias lo vuelca', () => {
        // Cubre las cuatro formas de cerrar, el «atrás» del navegador y el cambio de
        // sección: todas desmontan el panel.
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, alVolcar: ['freeText'] };
        const { rerender, unmount } = montar({ ...base, valor: { freeText: '' } });
        rerender({ ...base, valor: { freeText: 'a medias' } });
        expect(guardar).not.toHaveBeenCalled();

        unmount();
        expect(guardar).toHaveBeenCalledTimes(1);
        expect(guardar.mock.calls[0][0]).toEqual({ freeText: 'a medias' });
    });

    it('desmontar sin cambios NO manda nada', () => {
        const guardar = vi.fn().mockResolvedValue(undefined);
        const { unmount } = montar({ valor: { a: 1 }, guardar, habilitado: true });
        unmount();
        expect(guardar).not.toHaveBeenCalled();
    });

    it('no rompe si el guardado falla al desmontar', () => {
        // El acuse muere con el componente; el fallo no puede tumbar el desmontaje.
        const guardar = vi.fn().mockRejectedValue(new Error('500'));
        const base = { guardar, habilitado: true, instantaneos: ['a'] };
        const { rerender, unmount } = montar({ ...base, valor: { a: 1 } });
        rerender({ ...base, valor: { a: 2 } });
        expect(() => unmount()).not.toThrow();
        expect(guardar).toHaveBeenCalledTimes(1);
    });
});

describe('[P1-SETTINGS-AUTOSAVE] el acuse', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('recorre pendiente → guardando → guardado', async () => {
        const vistos = [];
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, instantaneos: ['a'], onEstado: (e) => vistos.push(e) };
        const { rerender } = montar({ ...base, valor: { a: 1 } });
        rerender({ ...base, valor: { a: 2 } });
        expect(vistos).toContain('pendiente');
        await act(async () => { vi.advanceTimersByTime(RETARDO_INSTANTANEO_MS + 50); });
        expect(vistos).toContain('guardando');
        expect(vistos[vistos.length - 1]).toBe('guardado');
    });

    it('un guardado fallido lo dice, no se lo calla', async () => {
        const vistos = [];
        const guardar = vi.fn().mockRejectedValue(new Error('500'));
        const base = { guardar, habilitado: true, instantaneos: ['a'], onEstado: (e) => vistos.push(e) };
        const { rerender } = montar({ ...base, valor: { a: 1 } });
        rerender({ ...base, valor: { a: 2 } });
        await act(async () => { vi.advanceTimersByTime(RETARDO_INSTANTANEO_MS + 50); });
        expect(vistos[vistos.length - 1]).toBe('error');
    });

    it('el texto libre pendiente marca «pendiente» aunque no salga aún', () => {
        // Si no, el usuario cree que ya está a salvo mientras no lo está.
        const vistos = [];
        const guardar = vi.fn().mockResolvedValue(undefined);
        const base = { guardar, habilitado: true, alVolcar: ['freeText'], onEstado: (e) => vistos.push(e) };
        const { rerender } = montar({ ...base, valor: { freeText: '' } });
        rerender({ ...base, valor: { freeText: 'x' } });
        expect(vistos).toContain('pendiente');
    });
});
