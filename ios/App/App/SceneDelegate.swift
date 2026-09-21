import UIKit
import WebKit
import ObjectiveC
import AuthenticationServices
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var observadoresDeTeclado: [NSObjectProtocol] = []

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = PuenteBioboros()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        avisarDelTecladoALaWeb()
    }

    // [P1-PLAN-LOTE-128] EL TECLADO AVISA ANTES DE MOVERSE. El dueno: «no puedes hacer mas fluido el cerrar y abrir
    // el teclado?». La web solo se entera del teclado por `visualViewport`, e iOS entrega ese `resize` cuando la
    // animacion YA TERMINO; por eso el chat adivina (foco => abre, con el alto de la ultima vez; blur => cierra) y
    // usa una duracion fija. UIKit si lo sabe a tiempo: `keyboardWillShow/Hide` llegan ANTES de la animacion, con el
    // alto exacto y su duracion. Aqui solo se RETRANSMITEN a la pagina como un evento (`mf:teclado-nativo`); que hace
    // la web con ellos vive en JS y se ajusta por OTA. Son observadores ANADIDOS: no se retira ninguno de WebKit
    // (eso es lo que hace @capacitor/keyboard y por lo que se descarto), asi que `visualViewport` sigue midiendo.
    private func avisarDelTecladoALaWeb() {
        guard observadoresDeTeclado.isEmpty else { return }
        let centro = NotificationCenter.default
        observadoresDeTeclado.append(centro.addObserver(forName: UIResponder.keyboardWillShowNotification, object: nil, queue: .main) { [weak self] aviso in
            self?.retransmitirTeclado("abre", aviso)
        })
        observadoresDeTeclado.append(centro.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { [weak self] aviso in
            self?.retransmitirTeclado("cierra", aviso)
        })
    }

    private func retransmitirTeclado(_ tipo: String, _ aviso: Notification) {
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController else { return }
        let marco = (aviso.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? CGRect.zero
        let segundos = (aviso.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0.25
        let alto = Int(marco.height.rounded())
        let ms = Int((segundos * 1000).rounded())
        let js = "window.dispatchEvent(new CustomEvent('mf:teclado-nativo',{detail:{tipo:'\(tipo)',alto:\(alto),ms:\(ms)}}))"
        bridgeVC.webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // [P1-PLAN-LOTE-128 · 2026-09-19] SIN la barra de accesorios del teclado (las flechas ⌃ ⌄ y el ✓ que iOS pone
    // encima del teclado en cualquier campo de un WKWebView). El dueno: «quita la barra de flechas de iOS sobre el
    // teclado». En el chat no sirve de nada (hay UN campo) y se come ~45 pt justo donde va la conversacion.
    //
    // Va AQUI y no en AppDelegate: la app usa ciclo de vida por ESCENAS (UIApplicationSceneManifest en Info.plist), y
    // con escenas UIKit no llama a `applicationDidBecomeActive` ni rellena `AppDelegate.window` — esto es lo que corre.
    // Es idempotente (la clase ya cambiada se reconoce por su sufijo), asi que repetirlo en cada activacion no cuesta.
    //
    // NO se usa @capacitor/keyboard (que tambien la quita): su `load` retira los observadores del teclado del WebView
    // en TODOS sus modos y `visualViewport` dejaria de encoger — toda la geometria del chat (keyboardViewport.js)
    // quedaria ciega, y un fallo nativo no se arregla por OTA (decision del lote 111).
    func sceneDidBecomeActive(_ scene: UIScene) {
        if let bridgeVC = window?.rootViewController as? CAPBridgeViewController {
            bridgeVC.webView?.ocultarBarraDeAccesorios()
        }
    }
}

// [P1-PLAN-LOTE-146 · 2026-09-20] «CONTINUAR CON APPLE», NATIVO. El dueno: «por que en la app nativa no esta el
// boton de continuar con google?». Porque el OAuth por redireccion no vuelve a la app (P1-IOS-OAUTH-GATE), y Apple
// (4.8) exige su propio boton si se ofrece otro proveedor social. Neon Auth no ofrece Apple como proveedor, asi que
// el camino es el del SDK: la hoja nativa (Face ID), sin Safari ni redirecciones.
//
// El binario solo PIDE la credencial y se la entrega a la web; no decide nada. El identity token (un JWT firmado por
// Apple) viaja al backend, que lo verifica contra las claves publicas de Apple y emite la sesion. El `nonce` llega ya
// como SHA-256 (lo calcula la web, que se queda el crudo para el backend): un token robado de otra sesion no lo trae.
//
// Es un plugin LOCAL de Capacitor (no un manejador de mensajes de WebKit: aquel canal fue el del teclado nativo, revertido en
// el lote 143) registrado por el controlador propio. La web pregunta `isPluginAvailable('MfAppleSignIn')` antes de
// pintar el boton: un binario sin este codigo simplemente no lo ofrece.
final class PuenteBioboros: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(MfAppleSignInPlugin())
    }
}

@objc(MfAppleSignInPlugin)
final class MfAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    let identifier = "MfAppleSignInPlugin"
    let jsName = "MfAppleSignIn"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var llamadaEnCurso: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.reject("falta el nonce", "NONCE")
            return
        }
        if llamadaEnCurso != nil {
            call.reject("ya hay una peticion en curso", "EN_CURSO")
            return
        }
        call.keepAlive = true
        llamadaEnCurso = call
        let peticion = ASAuthorizationAppleIDProvider().createRequest()
        peticion.requestedScopes = [.fullName, .email]
        peticion.nonce = nonce
        DispatchQueue.main.async {
            let controlador = ASAuthorizationController(authorizationRequests: [peticion])
            controlador.delegate = self
            controlador.presentationContextProvider = self
            controlador.performRequests()
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let llamada = llamadaEnCurso else { return }
        llamadaEnCurso = nil
        defer { bridge?.releaseCall(llamada) }
        guard let credencial = authorization.credential as? ASAuthorizationAppleIDCredential,
              let datos = credencial.identityToken,
              let token = String(data: datos, encoding: .utf8) else {
            llamada.reject("Apple no entrego el identity token", "SIN_TOKEN")
            return
        }
        // El nombre SOLO llega la primera vez que la persona autoriza la app; despues viene vacio.
        let partes = [credencial.fullName?.givenName, credencial.fullName?.familyName].compactMap { $0 }.filter { !$0.isEmpty }
        llamada.resolve([
            "identityToken": token,
            "name": partes.joined(separator: " ")
        ])
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let llamada = llamadaEnCurso else { return }
        llamadaEnCurso = nil
        defer { bridge?.releaseCall(llamada) }
        let codigo = (error as? ASAuthorizationError)?.code
        if codigo == .canceled {
            llamada.reject("cancelado", "CANCELADO")
        } else {
            llamada.reject(error.localizedDescription, "APPLE_\((error as NSError).code)")
        }
    }
}

// La tecnica de siempre (la misma que usa el plugin de teclado por dentro): la barra la aporta la vista interna de
// contenido del WKWebView (`WKContentView`) a traves de `inputAccessoryView`. Se crea en tiempo de ejecucion una subclase
// de ESA clase cuyo `inputAccessoryView` devuelve nil, y se le cambia la clase a la instancia. No toca API privada por
// nombre: localiza la vista por el prefijo de su clase y, si un iOS futuro la renombra, no encuentra nada y no hace nada.
final class SinBarraDeAccesorios: NSObject {
    @objc var inputAccessoryView: UIView? { return nil }
}

extension WKWebView {
    func ocultarBarraDeAccesorios() {
        let sufijo = "_SinBarraDeAccesorios"
        guard let contenido = scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }),
              let claseActual: AnyClass = object_getClass(contenido) else { return }
        let nombreActual = NSStringFromClass(claseActual)
        if nombreActual.hasSuffix(sufijo) { return }

        let nombreNuevo = nombreActual + sufijo
        var claseNueva: AnyClass? = NSClassFromString(nombreNuevo)
        if claseNueva == nil {
            let selector = #selector(getter: SinBarraDeAccesorios.inputAccessoryView)
            guard let metodo = class_getInstanceMethod(SinBarraDeAccesorios.self, selector),
                  let creada: AnyClass = objc_allocateClassPair(claseActual, nombreNuevo, 0) else { return }
            _ = class_addMethod(creada, selector, method_getImplementation(metodo), method_getTypeEncoding(metodo))
            objc_registerClassPair(creada)
            claseNueva = creada
        }
        if let claseNueva = claseNueva {
            object_setClass(contenido, claseNueva)
        }
    }
}
