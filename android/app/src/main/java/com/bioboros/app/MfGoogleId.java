package com.bioboros.app;

import android.os.CancellationSignal;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * [P1-PLAN-LOTE-160 · 2026-09-22] «Continuar con Google» en Android.
 *
 * <p>El camino de iOS (lote 147) NO sirve aquí y no es cuestión de esfuerzo: Google retiró el soporte de
 * esquemas propios como destino de redirección en Android. Sin esquema propio no hay vuelta del navegador,
 * y sin vuelta no hay código de autorización que canjear. El camino vigente es Credential Manager, que
 * entrega el {@code id_token} ya emitido y firmado.
 *
 * <p><b>Este plugin es TONTO a propósito</b>, igual que {@code MfWebAuth} en iOS: abre la hoja del sistema y
 * devuelve el token en crudo. Ni lo mira, ni lo guarda, ni decide nada con él. Toda la verificación vive en
 * nuestro backend ({@code /api/auth/google/native}), que comprueba firma, emisor, audiencia, nonce y
 * frescura. Un plugin que decidiera aquí sería una defensa imposible de arreglar sin repartir otro APK.
 *
 * <p>Dos datos entran desde la web y ninguno es secreto: el {@code serverClientId} —el cliente de tipo
 * <b>Web</b>, que Google exige en Android y que acaba siendo el {@code aud} del token— y el {@code nonce},
 * que es lo que ata este token a esta petición. Viven en la web a propósito: así se pueden corregir por OTA
 * sin pedir otro binario.
 */
@CapacitorPlugin(name = "MfGoogleId")
public class MfGoogleId extends Plugin {

    /** Uno para todo el plugin: un executor por llamada dejaría un hilo colgando en cada intento de login. */
    private static final Executor HILO = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void start(PluginCall call) {
        final String serverClientId = call.getString("serverClientId");
        final String nonce = call.getString("nonce");
        if (serverClientId == null || serverClientId.isEmpty()) {
            call.reject("Falta el serverClientId.", "SIN_CLIENTE");
            return;
        }

        GetSignInWithGoogleOption.Builder opcion = new GetSignInWithGoogleOption.Builder(serverClientId);
        if (nonce != null && !nonce.isEmpty()) {
            opcion.setNonce(nonce);
        }
        GetCredentialRequest peticion = new GetCredentialRequest.Builder()
                .addCredentialOption(opcion.build())
                .build();

        CredentialManager gestor = CredentialManager.create(getContext());
        gestor.getCredentialAsync(
                getActivity(),
                peticion,
                new CancellationSignal(),
                HILO,
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse respuesta) {
                        Credential credencial = respuesta.getCredential();
                        // Comprobar el TIPO antes de leerlo: Credential Manager es genérico y un día puede
                        // devolver una llave de acceso o una contraseña guardada. Leer el bundle a ciegas
                        // convertiría ese día en un fallo incomprensible dentro de `createFrom`.
                        if (!(credencial instanceof CustomCredential)
                                || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credencial.getType())) {
                            call.reject("La credencial no es de Google.", "TIPO_INESPERADO");
                            return;
                        }
                        try {
                            GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credencial.getData());
                            JSObject salida = new JSObject();
                            salida.put("idToken", google.getIdToken());
                            call.resolve(salida);
                        } catch (Exception e) {
                            call.reject("No se pudo leer el token de Google.", "SIN_TOKEN", e);
                        }
                    }

                    @Override
                    public void onError(GetCredentialException e) {
                        // Cerrar la hoja NO es un error: es la respuesta «ahora no». La web distingue este
                        // código para no pintar un mensaje rojo a quien simplemente cambió de idea.
                        if (e instanceof GetCredentialCancellationException) {
                            call.reject("Cancelado por la persona.", "CANCELADO");
                            return;
                        }
                        // Sin ninguna cuenta de Google en el teléfono tampoco hay nada que arreglar desde aquí:
                        // se distingue para poder decirlo con palabras en vez de «error inesperado».
                        if (e instanceof NoCredentialException) {
                            call.reject("No hay cuentas de Google en este dispositivo.", "SIN_CUENTAS");
                            return;
                        }
                        call.reject("Google no completó el acceso.", "FALLO", e);
                    }
                });
    }
}
