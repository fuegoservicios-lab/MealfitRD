package com.bioboros.app;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // [P1-PLAN-LOTE-160 · 2026-09-22] Los plugins LOCALES hay que registrarlos a mano, y ANTES de
        // `super.onCreate`: el puente se construye ahí dentro y solo publica lo que ya esté declarado. Los
        // plugins que vienen de un paquete npm los descubre Capacitor solo; éste vive en el propio proyecto.
        //
        // Si esta línea falta, `registerPlugin('MfGoogleId')` en la web devuelve un Proxy que no responde y
        // `googleSignInNativo()` da false: el botón simplemente no aparece, sin error en ninguna parte.
        registerPlugin(MfGoogleId.class);
        // [P1-PLAN-LOTE-962 · 2026-10-01] Sin el pitido del reconocedor de voz mientras el modo voz escucha.
        registerPlugin(MfSilencioVoz.class);
        super.onCreate(savedInstanceState);
        apartarDeBarrasYTeclado();
    }

    // [ANDROID-PLAY-TARGET-36 · 2026-11-13] Play exige targetSdk 36, y desde el 35 Android dibuja la app DEBAJO de la
    // barra de estado, de la de navegación y del teclado: `adjustResize` deja de encoger la ventana y el sistema solo
    // AVISA de los márgenes. Aquí se le devuelve a la web exactamente lo que tenía con targetSdk 34: la WebView queda
    // entre las barras y se encoge UNA vez con el teclado (el `visualViewport` del chat y la red del formulario del
    // lote 166 dependen de eso). Detrás de las barras se ve el fondo de la ventana, el negro del arranque.
    //
    // Los márgenes se entregan a la WebView ya en CERO, a propósito: si le llega el del teclado, Chromium (>= 140, con
    // `interactive-widget=resizes-content`) se encoge OTRA vez — el doble encogido del lote 170. No se devuelve
    // `CONSUMED`: deja valores viejos en `env(safe-area-inset-*)` (Chromium 461332423).
    //
    // En Android 14 o anterior el sistema sigue apartando la app él solo y aquí llegan ceros: no hace nada.
    private void apartarDeBarrasYTeclado() {
        View raiz = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(raiz, (vista, margenes) -> {
            int deBarras = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets barras = margenes.getInsets(deBarras);
            Insets teclado = margenes.getInsets(WindowInsetsCompat.Type.ime());
            vista.setPadding(barras.left, barras.top, barras.right, Math.max(barras.bottom, teclado.bottom));
            return new WindowInsetsCompat.Builder(margenes)
                .setInsets(deBarras, Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });
    }
}
