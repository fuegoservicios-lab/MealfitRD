package com.bioboros.app;

import android.os.Bundle;

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
        super.onCreate(savedInstanceState);
    }
}
