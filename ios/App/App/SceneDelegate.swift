import UIKit
import WebKit
import ObjectiveC
import AuthenticationServices
import Capacitor
import ImageIO
import PhotosUI
import UniformTypeIdentifiers

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
        bridge?.registerPluginInstance(MfWebAuthPlugin())
        bridge?.registerPluginInstance(MfFotosPlugin())
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
        var respuesta: [String: Any] = [
            "identityToken": token,
            "name": partes.joined(separator: " ")
        ]
        // [P1-PLAN-LOTE-848 · 2026-09-29] El codigo de autorizacion (un solo uso, 5 min): el backend lo canjea por un
        // refresh token para poder REVOCARLO al borrar la cuenta (App Review 5.1.1(v)). Si no llega, se entra igual.
        if let datosDelCodigo = credencial.authorizationCode,
           let codigo = String(data: datosDelCodigo, encoding: .utf8),
           !codigo.isEmpty {
            respuesta["authorizationCode"] = codigo
        }
        llamada.resolve(respuesta)
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

// [P1-PLAN-LOTE-147 · 2026-09-21] SESION WEB DE AUTENTICACION, generica. El dueno: «¿por que en la app nativa no
// esta el boton de continuar con google?». Porque el OAuth por redireccion manda a Safari y `capacitor://localhost`
// no es una direccion a la que Safari sepa volver (P1-IOS-OAUTH-GATE).
//
// `ASWebAuthenticationSession` es la respuesta de Apple a exactamente eso: abre la pagina del proveedor en una vista
// del sistema DENTRO de la app y captura ella misma la vuelta por un esquema propio, sin registrar nada en el
// Info.plist. Es un marco del sistema: cero dependencias nuevas en el binario (el SDK de Google habria sido un pod).
//
// Este plugin es TONTO a proposito: recibe una URL y el esquema de vuelta, y devuelve la URL con la que el sistema
// volvio. No sabe que es OAuth, ni que es Google. Toda la logica (PKCE, nonce, que parametros lleva la URL) vive en
// JS y por tanto se arregla por OTA. La leccion de esta racha: cada ronda que necesita un build del dueno se paga
// cara, asi que lo que pueda vivir en la web, vive en la web.
@objc(MfWebAuthPlugin)
final class MfWebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    let identifier = "MfWebAuthPlugin"
    let jsName = "MfWebAuth"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]
    private var sesion: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let texto = call.getString("url"), let url = URL(string: texto),
              let esquema = call.getString("scheme"), !esquema.isEmpty else {
            call.reject("faltan url o scheme", "ARGUMENTOS")
            return
        }
        // Solo https: este plugin no abre esquemas arbitrarios aunque quien lo llame sea nuestro propio JS.
        guard url.scheme?.lowercased() == "https" else {
            call.reject("solo https", "ESQUEMA")
            return
        }
        call.keepAlive = true
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let sesion = ASWebAuthenticationSession(url: url, callbackURLScheme: esquema) { vuelta, error in
                defer { self.sesion = nil; self.bridge?.releaseCall(call) }
                if let vuelta = vuelta {
                    call.resolve(["callbackUrl": vuelta.absoluteString])
                    return
                }
                if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("cancelado", "CANCELADO")
                } else {
                    call.reject(error?.localizedDescription ?? "fallo la sesion", "SESION")
                }
            }
            sesion.presentationContextProvider = self
            // Con `false` la vista comparte las cookies de Safari: si ya tiene sesion de Google, es un solo toque.
            sesion.prefersEphemeralWebBrowserSession = false
            self.sesion = sesion
            if !sesion.start() {
                self.sesion = nil
                self.bridge?.releaseCall(call)
                call.reject("no se pudo abrir la sesion", "NO_ABRE")
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

// [P1-PLAN-LOTE-848 · 2026-09-29] LA FOTOTECA, SIN PEDIR ACCESO Y SIN EL MENU DE TRES OPCIONES. Auditoria App Store,
// fila 2.3 (guia 5.1.1(iii), minimizacion): `Camera.pickImages` pedia acceso COMPLETO a Fotos antes de abrir el
// selector. El `<input type="file">` de WebKit (la parte A de este lote) ya usa PHPicker sin permiso, pero antes enseña
// el menu de iOS «Fototeca / Hacer foto / Seleccionar archivo» que el dueno habia quitado en los lotes 105 y 110.
//
// Este plugin abre `PHPickerViewController` DIRECTO: corre fuera de proceso, la app solo recibe las fotos que la
// persona elige y iOS no pregunta nada (no se llama a `PHPhotoLibrary.requestAuthorization`). Cada foto sale derecha
// (la orientacion EXIF aplicada), reducida a `maxSide` px sin decodificarla entera, en JPEG a `quality`, como data URL.
// Cancelar devuelve una lista vacia. La web pregunta `isPluginAvailable('MfFotos')` ANTES de esperar nada: un binario
// sin este codigo sigue con el `<input>` (nativeChatImagePicker.js).
@objc(MfFotosPlugin)
final class MfFotosPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    let identifier = "MfFotosPlugin"
    let jsName = "MfFotos"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise)
    ]
    private var llamadaEnCurso: CAPPluginCall?
    private var ladoMaximo: CGFloat = 1600
    private var calidad: CGFloat = 0.85

    @objc func pick(_ call: CAPPluginCall) {
        let limite = max(1, min(call.getInt("limit") ?? 1, 4))
        let lado = CGFloat(max(320.0, min(call.getDouble("maxSide") ?? 1600.0, 4096.0)))
        let q = CGFloat(max(0.5, min(call.getDouble("quality") ?? 0.85, 1.0)))
        call.keepAlive = true
        // Todo el estado del plugin se lee y se escribe en el hilo principal, donde tambien contestan los delegados.
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.llamadaEnCurso != nil {
                call.reject("ya hay una seleccion en curso", "EN_CURSO")
                self.bridge?.releaseCall(call)
                return
            }
            guard var presentador = self.bridge?.viewController else {
                call.reject("no hay vista para presentar el selector", "SIN_VISTA")
                self.bridge?.releaseCall(call)
                return
            }
            while let encima = presentador.presentedViewController {
                presentador = encima
            }
            // Una vista que se esta cerrando o que no esta en pantalla no presenta nada y la llamada se quedaria colgada.
            if presentador.isBeingDismissed || presentador.viewIfLoaded?.window == nil {
                call.reject("no hay vista para presentar el selector", "SIN_VISTA")
                self.bridge?.releaseCall(call)
                return
            }
            self.llamadaEnCurso = call
            self.ladoMaximo = lado
            self.calidad = q
            var configuracion = PHPickerConfiguration()
            configuracion.filter = .images
            configuracion.selectionLimit = limite
            let selector = PHPickerViewController(configuration: configuracion)
            selector.delegate = self
            selector.presentationController?.delegate = self
            presentador.present(selector, animated: true)
        }
    }

    // «Cancelar» llega aqui con la lista vacia: se resuelve con `images: []` (la web lo trata como cancelacion).
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let llamada = llamadaEnCurso else { return }
        llamadaEnCurso = nil
        if results.isEmpty {
            llamada.resolve(["images": [String]()])
            bridge?.releaseCall(llamada)
            return
        }
        let proveedores = results.map { $0.itemProvider }
        MfFotosPlugin.cargarEnOrden(proveedores, desde: 0, lado: ladoMaximo, calidad: calidad, acumuladas: []) { [weak self] urls in
            DispatchQueue.main.async {
                llamada.resolve(["images": urls])
                self?.bridge?.releaseCall(llamada)
            }
        }
    }

    // De UNA en UNA y en el orden elegido: solo una foto original (hasta decenas de MB) esta en memoria a la vez.
    private static func cargarEnOrden(_ proveedores: [NSItemProvider], desde indice: Int, lado: CGFloat, calidad: CGFloat,
                                      acumuladas: [String], alTerminar: @escaping ([String]) -> Void) {
        guard indice < proveedores.count else {
            alTerminar(acumuladas)
            return
        }
        let proveedor = proveedores[indice]
        guard proveedor.hasItemConformingToTypeIdentifier(UTType.image.identifier) else {
            MfFotosPlugin.cargarEnOrden(proveedores, desde: indice + 1, lado: lado, calidad: calidad,
                                        acumuladas: acumuladas, alTerminar: alTerminar)
            return
        }
        proveedor.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { datos, _ in
            var nuevas = acumuladas
            if let datos = datos, let jpeg = MfFotosPlugin.reducir(datos, lado: lado, calidad: calidad) {
                nuevas.append("data:image/jpeg;base64," + jpeg.base64EncodedString())
            }
            MfFotosPlugin.cargarEnOrden(proveedores, desde: indice + 1, lado: lado, calidad: calidad,
                                        acumuladas: nuevas, alTerminar: alTerminar)
        }
    }

    // Red de seguridad: si la hoja se cierra deslizando sin pasar por el delegado del selector, la llamada no se queda
    // colgada. Si el delegado ya contesto, `llamadaEnCurso` es nil y esto no hace nada.
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard let llamada = llamadaEnCurso else { return }
        llamadaEnCurso = nil
        llamada.resolve(["images": [String]()])
        bridge?.releaseCall(llamada)
    }

    // ImageIO crea la imagen reducida SIN decodificar la foto entera (una de 48 MP no ocupa 190 MB en memoria), y
    // `WithTransform` aplica la orientacion EXIF: la imagen sale derecha (.up). No amplia las que ya son pequenas.
    static func reducir(_ datos: Data, lado: CGFloat, calidad: CGFloat) -> Data? {
        guard let fuente = CGImageSourceCreateWithData(datos as CFData, nil) else { return nil }
        let opciones: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: Int(lado)
        ]
        guard let imagen = CGImageSourceCreateThumbnailAtIndex(fuente, 0, opciones as CFDictionary) else { return nil }
        return UIImage(cgImage: imagen).jpegData(compressionQuality: calidad)
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
