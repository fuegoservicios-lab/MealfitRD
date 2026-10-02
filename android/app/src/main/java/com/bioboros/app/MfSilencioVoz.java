package com.bioboros.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * [P1-PLAN-LOTE-962 · 2026-10-01] Sin el pitido del reconocedor de voz de Android mientras el modo voz está abierto.
 *
 * <p>El dueño: «quita también el pitido de Android». El reconocedor del sistema pita al empezar y al dejar de
 * escuchar. El plugin de voz (@capgo) solo silencia el de ARRANQUE: devuelve el volumen en {@code onReadyForSpeech},
 * así que el de cierre (y el de cada turno siguiente) sonaba. Este plugin silencia los canales de notificación y de
 * sistema —por donde suena ese pitido— durante TODA la sesión del modo voz, y los devuelve al cerrarla. La app pone
 * su propia señal de abrir/cerrar (lote 961) por el canal de música, que no se toca.
 *
 * <p>Por qué {@code ADJUST_MUTE} y no fijar el volumen a 0: el silencio guarda el volumen del usuario y
 * {@code ADJUST_UNMUTE} lo devuelve exacto, sin que tengamos que recordarlo ni arriesgarnos a restaurar un número
 * equivocado.
 *
 * <p>Lo único inaceptable es dejarle el teléfono callado. Cuatro redes: (1) {@code restaurar()} al cerrar el modo voz;
 * (2) al pasar la app a segundo plano ({@code handleOnPause}: el modo voz también se pausa ahí); (3) un tope de
 * {@link #TOPE_MS} que se renueva con cada turno — si la web deja de llamar, se restaura solo; (4) una marca en
 * {@code SharedPreferences}: si la app murió con el silencio puesto, al volver a cargar el plugin se restaura.
 */
@CapacitorPlugin(name = "MfSilencioVoz")
public class MfSilencioVoz extends Plugin {

    private static final String TAG = "MfSilencioVoz";
    private static final String PREFS = "mf_silencio_voz";
    private static final String MARCA = "silenciado";
    private static final String CANALES_MUTADOS = "canales_mutados";
    static final long TOPE_MS = 120_000L;
    private static final int[] CANALES = { AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_SYSTEM };

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable restaurarSolo = this::restaurarAhora;
    private boolean silenciado = false;
    private int canalesMutados = 0;

    @Override
    public void load() {
        super.load();
        // Red 4: una sesión anterior murió con el silencio puesto.
        if (prefs().getBoolean(MARCA, false)) {
            silenciado = true;
            canalesMutados = prefs().getInt(CANALES_MUTADOS, 0);
            restaurarAhora();
        }
    }

    @PluginMethod
    public void silenciar(PluginCall call) {
        boolean ok = true;
        AudioManager am = audio();
        if (am != null && !silenciado) {
            for (int i = 0; i < CANALES.length; i++) {
                int canal = CANALES[i];
                try {
                    // Solo restaurar canales que esta sesión cambió. Respetar el silencio previo del usuario.
                    if (am.isStreamMute(canal)) continue;
                    canalesMutados |= 1 << i;
                    // Guardar antes de tocar el audio permite restaurar también si muere el proceso.
                    prefs().edit().putBoolean(MARCA, true).putInt(CANALES_MUTADOS, canalesMutados).commit();
                    am.adjustStreamVolume(canal, AudioManager.ADJUST_MUTE, 0);
                } catch (SecurityException ex) {
                    // Con «No molestar» algunos teléfonos no dejan tocar el canal de notificación: se sigue sin él.
                    ok = false;
                    Logger.warn(TAG, "no se pudo silenciar el canal " + canal + ": " + ex.getMessage());
                }
            }
            silenciado = true;
            prefs().edit().putBoolean(MARCA, true).apply();
        }
        handler.removeCallbacks(restaurarSolo);
        handler.postDelayed(restaurarSolo, TOPE_MS);   // red 3: se renueva con cada llamada
        JSObject r = new JSObject();
        r.put("silenciado", silenciado);
        r.put("completo", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void restaurar(PluginCall call) {
        restaurarAhora();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        restaurarAhora();   // red 2
    }

    @Override
    protected void handleOnDestroy() {
        restaurarAhora();
        super.handleOnDestroy();
    }

    private void restaurarAhora() {
        handler.removeCallbacks(restaurarSolo);
        if (!silenciado) return;
        AudioManager am = audio();
        if (am != null) {
            for (int i = 0; i < CANALES.length; i++) {
                if ((canalesMutados & (1 << i)) == 0) continue;
                int canal = CANALES[i];
                try {
                    am.adjustStreamVolume(canal, AudioManager.ADJUST_UNMUTE, 0);
                } catch (SecurityException ex) {
                    Logger.warn(TAG, "no se pudo restaurar el canal " + canal + ": " + ex.getMessage());
                }
            }
        }
        silenciado = false;
        canalesMutados = 0;
        prefs().edit().putBoolean(MARCA, false).remove(CANALES_MUTADOS).apply();
    }

    private AudioManager audio() {
        try {
            return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        } catch (Exception ex) {
            return null;
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
