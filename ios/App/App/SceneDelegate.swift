import UIKit
import WebKit
import ObjectiveC
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
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
