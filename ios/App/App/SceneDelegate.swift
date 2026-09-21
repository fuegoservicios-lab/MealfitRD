import UIKit
import WebKit
import ObjectiveC
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var observadoresDeTeclado: [NSObjectProtocol] = []
    private let cobertura = CoberturaDelTeclado()

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        avisarDelTecladoALaWeb()
        conectarCobertura()
    }

    // [P1-PLAN-LOTE-140] La pagina sabe que ESTE binario puede mover el chat porque existe el manejador
    // `window.webkit.messageHandlers.mfTeclado`: se registra cuanto antes (y otra vez al activarse, por si el WebView
    // aun no existia). Es idempotente.
    private func conectarCobertura() {
        if let bridgeVC = window?.rootViewController as? CAPBridgeViewController, let webView = bridgeVC.webView {
            cobertura.conectar(webView)
        }
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

    // [P1-PLAN-LOTE-140] Ademas de avisar, el binario puede MOVER el chat (ver `CoberturaDelTeclado`, abajo). El orden
    // importa: primero la captura de lo que hay en pantalla, DESPUES el aviso — la pagina, al recibirlo con
    // `cubierto:true`, pone su layout final de golpe debajo de la captura. Una pagina vieja ignora los campos nuevos.
    private func retransmitirTeclado(_ tipo: String, _ aviso: Notification) {
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController else { return }
        let marco = (aviso.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? CGRect.zero
        let segundos = (aviso.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0.25
        let curva = (aviso.userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? NSNumber)?.intValue ?? 7
        let alto = Int(marco.height.rounded())
        let ms = Int((segundos * 1000).rounded())
        conectarCobertura()
        let resultado = cobertura.alAvisoDelTeclado(tipo: tipo, alto: marco.height, segundos: segundos, curva: curva)
        let cubierto = resultado.cubierto ? "true" : "false"
        let js = "window.dispatchEvent(new CustomEvent('mf:teclado-nativo',{detail:{tipo:'\(tipo)',alto:\(alto),ms:\(ms),cubierto:\(cubierto),id:\(resultado.id),motivo:'\(resultado.motivo)'}}))"
        bridgeVC.webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        cobertura.retirarYa()
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
        conectarCobertura()
    }
}

// [P1-PLAN-LOTE-140 · 2026-09-20] EL BINARIO MUEVE EL CHAT CON EL TECLADO. El dueno: «en la app de Gemini se siente muy
// pero muy fluido y rapido». Gemini es nativa: sus vistas se animan DENTRO de la animacion del teclado, en el servidor de
// render, a la cadencia de la pantalla. Una pagina no puede: o anima `height` (layout por fotograma en su hilo) o un
// `transform` que arranca tarde y a otro ritmo, y con el layout aun cerrado iOS panea el documento (medido, lote 139).
//
// Lo que se hace aqui: al llegar `keyboardWillShow/Hide` se CAPTURA lo que hay en pantalla en tiras (la conversacion, la
// caja de escribir y las fichas de la cabecera, que no se mueven), se ponen encima del WebView y UIKit las mueve con la
// MISMA curva y duracion del teclado. Debajo, la pagina pone su layout final de una vez, sin animar nada (nadie lo ve).
// Cuando la animacion termina Y la pagina dice `listo`, las tiras se funden y queda la pagina viva, ya en su sitio.
//
//   · La GEOMETRIA la manda la pagina ANTES (al enfocar, al asentarse, al cambiar la caja): aqui no hay tiempo de
//     preguntar. Sin geometria valida, o con el modo apagado (`activo:false`), no se cubre y todo sigue como siempre.
//   · Cada cobertura lleva un `id`; un `listo` de otra cobertura no retira nada. Y hay un plazo: pase lo que pase en la
//     pagina, las tiras se van solas (una captura olvidada encima del chat seria peor que cualquier tiron).
//   · Las tiras no reciben toques: lo que se toque llega al WebView.
//   · Lo afinable (fundido, plazo, adelanto, tipo de captura) viaja en la geometria: se ajusta por OTA, sin otro build.
struct PiezaFijaDelChat {
    let rect: CGRect
    let radio: CGFloat
}

struct GeometriaDelChat {
    var activo = false
    var abierto = false
    var corte: CGFloat = 0
    var cajaTop: CGFloat = 0
    var padDelta: CGFloat = 0
    var listaMax: CGFloat = 0
    var fijas: [PiezaFijaDelChat] = []
    var fundidoMs: Double = 90
    var esperaMs: Double = 600
    var adelanto: Double = 1
    var trasActualizar = false

    init() {}

    init(_ datos: [String: Any]) {
        activo = (datos["activo"] as? Bool) ?? false
        abierto = (datos["abierto"] as? Bool) ?? false
        trasActualizar = (datos["trasActualizar"] as? Bool) ?? false
        corte = GeometriaDelChat.numero(datos["corte"])
        cajaTop = GeometriaDelChat.numero(datos["cajaTop"])
        padDelta = GeometriaDelChat.numero(datos["padDelta"])
        listaMax = GeometriaDelChat.numero(datos["listaMax"])
        if datos["fundidoMs"] != nil { fundidoMs = Double(GeometriaDelChat.numero(datos["fundidoMs"])) }
        if datos["esperaMs"] != nil { esperaMs = Double(GeometriaDelChat.numero(datos["esperaMs"])) }
        if datos["adelanto"] != nil { adelanto = Double(GeometriaDelChat.numero(datos["adelanto"])) }
        if let lista = datos["fijas"] as? [[String: Any]] {
            for pieza in lista.prefix(6) {
                let rect = CGRect(x: GeometriaDelChat.numero(pieza["x"]), y: GeometriaDelChat.numero(pieza["y"]),
                                  width: GeometriaDelChat.numero(pieza["w"]), height: GeometriaDelChat.numero(pieza["h"]))
                fijas.append(PiezaFijaDelChat(rect: rect, radio: GeometriaDelChat.numero(pieza["r"])))
            }
        }
    }

    static func numero(_ valor: Any?) -> CGFloat {
        guard let n = valor as? NSNumber else { return 0 }
        let d = n.doubleValue
        return d.isFinite ? CGFloat(d) : 0
    }
}

struct ResultadoDeCobertura {
    let cubierto: Bool
    let id: Int
    let motivo: String
}

final class CoberturaDelTeclado: NSObject, WKScriptMessageHandler {
    static let nombre = "mfTeclado"
    static let altoMinimo: CGFloat = 120

    private weak var webView: WKWebView?
    private var geometria = GeometriaDelChat()
    private var capa: UIView?
    private var capaSaliente: UIView?
    private var tiraCaja: UIView?
    private var tiraLista: UIView?
    private var baseAbierta = false
    private var padDeltaCapturado: CGFloat = 0
    private var listaMaxCapturado: CGFloat = 0
    private var ultimoAlto: CGFloat = 0
    private var idActual = 0
    private var animacionAcabada = false
    private var paginaLista = false

    func conectar(_ nuevo: WKWebView) {
        if webView === nuevo { return }
        webView = nuevo
        let controlador = nuevo.configuration.userContentController
        controlador.removeScriptMessageHandler(forName: CoberturaDelTeclado.nombre)
        controlador.add(self, name: CoberturaDelTeclado.nombre)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == CoberturaDelTeclado.nombre, let datos = message.body as? [String: Any] else { return }
        let tipo = (datos["tipo"] as? String) ?? ""
        if tipo == "geometria" {
            geometria = GeometriaDelChat(datos)
        } else if tipo == "apagar" {
            geometria.activo = false
            retirarYa()
        } else if tipo == "listo" {
            let id = (datos["id"] as? NSNumber)?.intValue ?? -1
            if id == idActual && capa != nil {
                paginaLista = true
                retirarSiProcede()
            }
        }
    }

    private func no(_ motivo: String) -> ResultadoDeCobertura {
        return ResultadoDeCobertura(cubierto: false, id: 0, motivo: motivo)
    }

    func alAvisoDelTeclado(tipo: String, alto: CGFloat, segundos: Double, curva: Int) -> ResultadoDeCobertura {
        let quiereAbierto = (tipo == "abre")
        if quiereAbierto && alto >= CoberturaDelTeclado.altoMinimo { ultimoAlto = alto }
        guard geometria.activo else { return no("apagado") }
        guard segundos > 0 else { return no("cero-ms") }
        guard let webView = webView else { return no("webview") }
        if quiereAbierto && alto < CoberturaDelTeclado.altoMinimo { return no("alto") }
        guard ultimoAlto >= CoberturaDelTeclado.altoMinimo else { return no("falta-alto") }

        if capa == nil {
            // cerrado -> abre, o abierto -> cierra; un cambio de teclado con el chat ya abierto no se cubre
            if geometria.abierto == quiereAbierto { return no("estado") }
            if !construirTiras(en: webView) { return no("captura") }
            baseAbierta = geometria.abierto
            padDeltaCapturado = geometria.padDelta
            listaMaxCapturado = geometria.listaMax
        }
        // Con una cobertura en vuelo (el teclado de paso 308 -> 335 al volver del selector, o cerrar a media subida) las
        // MISMAS tiras se re-apuntan desde donde esten: es lo que hace UIKit con el teclado, asi que siguen juntos.
        let recorrido = max(0, ultimoAlto - padDeltaCapturado)
        var destino: CGFloat = 0
        if quiereAbierto != baseAbierta { destino = baseAbierta ? recorrido : -recorrido }
        var destinoLista: CGFloat = 0
        if destino < 0 { destinoLista = -min(recorrido, listaMaxCapturado) }
        if destino > 0 { destinoLista = min(recorrido, listaMaxCapturado) }
        let factor = (quiereAbierto && geometria.adelanto > 0.3 && geometria.adelanto <= 1) ? geometria.adelanto : 1
        animar(destino: destino, destinoLista: destinoLista, segundos: segundos * factor, curva: curva)
        return ResultadoDeCobertura(cubierto: true, id: idActual, motivo: "ok")
    }

    // `keyboardWillShow` llega DENTRO del bloque de animacion de UIKit: una vista creada y colocada ahi dentro nace
    // animandose desde un marco vacio. Las tiras se montan sin animacion; lo unico que se anima es su `transform`.
    private func construirTiras(en webView: WKWebView) -> Bool {
        var hecho = false
        UIView.performWithoutAnimation {
            hecho = self.montarTiras(en: webView)
        }
        return hecho
    }

    private func montarTiras(en webView: WKWebView) -> Bool {
        capaSaliente?.removeFromSuperview()
        capaSaliente = nil
        let limites = webView.bounds
        let g = geometria
        guard g.cajaTop > 60, g.cajaTop < limites.height - 20, g.corte >= 0, g.corte < g.cajaTop - 20 else { return false }
        let rectLista = CGRect(x: 0, y: g.corte, width: limites.width, height: g.cajaTop - g.corte)
        let rectCaja = CGRect(x: 0, y: g.cajaTop, width: limites.width, height: limites.height - g.cajaTop)
        guard let lista = webView.resizableSnapshotView(from: rectLista, afterScreenUpdates: g.trasActualizar, withCapInsets: UIEdgeInsets.zero),
              let caja = webView.resizableSnapshotView(from: rectCaja, afterScreenUpdates: g.trasActualizar, withCapInsets: UIEdgeInsets.zero) else { return false }
        let nueva = UIView(frame: limites)
        nueva.isUserInteractionEnabled = false
        nueva.clipsToBounds = true
        nueva.backgroundColor = UIColor.clear
        lista.frame = rectLista
        caja.frame = rectCaja
        nueva.addSubview(lista)
        nueva.addSubview(caja)
        // las fichas de la cabecera (y la franja de la barra de estado) NO se mueven: van encima, quietas
        for pieza in g.fijas {
            let r = pieza.rect.intersection(limites)
            if r.isNull || r.width < 1 || r.height < 1 { continue }
            guard let ficha = webView.resizableSnapshotView(from: r, afterScreenUpdates: g.trasActualizar, withCapInsets: UIEdgeInsets.zero) else { continue }
            ficha.frame = r
            if pieza.radio > 0 {
                ficha.layer.cornerRadius = min(pieza.radio, min(r.width, r.height) / 2)
                ficha.layer.masksToBounds = true
            }
            nueva.addSubview(ficha)
        }
        webView.addSubview(nueva)
        capa = nueva
        tiraCaja = caja
        tiraLista = lista
        return true
    }

    private func animar(destino: CGFloat, destinoLista: CGFloat, segundos: Double, curva: Int) {
        idActual += 1
        let id = idActual
        animacionAcabada = false
        paginaLista = false
        let caja = tiraCaja
        let lista = tiraLista
        let opciones = UIView.AnimationOptions(rawValue: UInt(max(0, curva)) << 16).union([.beginFromCurrentState, .allowUserInteraction])
        UIView.animate(withDuration: segundos, delay: 0, options: opciones, animations: {
            caja?.transform = CGAffineTransform(translationX: 0, y: destino)
            lista?.transform = CGAffineTransform(translationX: 0, y: destinoLista)
        }, completion: nil)
        // El final se decide por RELOJ y no por el `completion`: un segundo aviso con el MISMO destino (335 -> 335) es una
        // animacion sin recorrido, y UIKit da la suya por terminada en el acto con la primera todavia en marcha.
        DispatchQueue.main.asyncAfter(deadline: .now() + segundos) { [weak self] in
            guard let yo = self, yo.idActual == id else { return }
            yo.animacionAcabada = true
            yo.retirarSiProcede()
        }
        let plazo = segundos + max(0.1, min(3, geometria.esperaMs / 1000))
        DispatchQueue.main.asyncAfter(deadline: .now() + plazo) { [weak self] in
            guard let yo = self, yo.idActual == id else { return }
            yo.retirar(fundido: yo.geometria.fundidoMs / 1000)
        }
    }

    private func retirarSiProcede() {
        if animacionAcabada && paginaLista { retirar(fundido: geometria.fundidoMs / 1000) }
    }

    func retirarYa() {
        retirar(fundido: 0)
    }

    private func retirar(fundido: Double) {
        guard let saliente = capa else { return }
        capa = nil
        tiraCaja = nil
        tiraLista = nil
        idActual += 1   // lo que quede pendiente de esta cobertura (fin de animacion, plazo, `listo`) ya no aplica
        if fundido <= 0 {
            saliente.removeFromSuperview()
            return
        }
        capaSaliente = saliente
        UIView.animate(withDuration: min(0.4, fundido), delay: 0, options: [.curveEaseOut, .allowUserInteraction], animations: {
            saliente.alpha = 0
        }, completion: { [weak self] _ in
            saliente.removeFromSuperview()
            if self?.capaSaliente === saliente { self?.capaSaliente = nil }
        })
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
