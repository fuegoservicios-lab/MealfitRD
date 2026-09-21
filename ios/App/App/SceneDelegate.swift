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
        let vivo = resultado.vivo ? "true" : "false"
        let js = "window.dispatchEvent(new CustomEvent('mf:teclado-nativo',{detail:{tipo:'\(tipo)',alto:\(alto),ms:\(ms),cubierto:\(cubierto),id:\(resultado.id),motivo:'\(resultado.motivo)',vivo:\(vivo)}}))"
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
        cobertura.asegurarEnSuSitio()
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
//
//   · La GEOMETRIA la manda la pagina ANTES (al enfocar, al asentarse, al cambiar la caja): aqui no hay tiempo de
//     preguntar. Sin geometria valida, o con el modo apagado (`activo:false`), no se cubre y todo sigue como siempre.
//   · Cada cobertura lleva un `id`; un mensaje de otra cobertura no retira nada. Y hay un plazo: pase lo que pase en la
//     pagina, las tiras se van solas (una captura olvidada encima del chat seria peor que cualquier tiron).
//   · Las tiras no reciben toques: lo que se toque llega al WebView.
//   · Lo afinable (fundidos, plazo, adelanto, tipo de captura, modo vivo) viaja en la geometria: se ajusta por OTA.
//
// [P1-PLAN-LOTE-142 · 2026-09-20] LA PAGINA VIVA TAMBIEN VIAJA (`vivo:true` en la geometria). El dueno, con el 141 en el
// telefono: «mejor, pero sigue habiendo delay alrededor del entorno… fallas visuales alrededor». Era inherente a mover SOLO
// una captura: todo lo que la captura no tiene (la barra de pestanas al cerrar, los mensajes que asoman por arriba, el
// cursor, el velo de la cabecera) aparecia al RETIRARLA, con la animacion ya acabada. Ahora el WebView entero se desplaza
// con un `transform` animado en el MISMO bloque que las tiras, haciendo el viaje complementario: la pagina —ya con su
// layout final— empieza desplazada justo lo que le falta y acaba en su sitio, de modo que en cada fotograma coincide con
// las tiras pixel a pixel. Las tiras solo tapan el relevo (los ~40 ms hasta que la pagina dice `listo`); despues se ve la
// pagina VIVA moviendose con el teclado. Las fichas y el velo de la cabecera siguen encima, quietos, hasta el final (la
// pagina esconde su cabecera durante el viaje y avisa con `fin` cuando la repone).
//   Invariante: tira desplazada S  ≡  pagina (layout destino) desplazada D   ⇔   D = S − destino.   Al final S = destino, D = 0.
//   SEGURO: toda salida (fin, plazo, perder la escena, `apagar`) deja `webView.transform = .identity`.
struct PiezaFijaDelChat {
    let rect: CGRect
    let radio: CGFloat
}

struct GeometriaDelChat {
    var activo = false
    var abierto = false
    var vivo = false
    var corte: CGFloat = 0
    var cajaTop: CGFloat = 0
    var padDelta: CGFloat = 0
    var listaMax: CGFloat = 0
    var franja: CGFloat = 0
    var veloAlto: CGFloat = 0
    var velo: UIColor?
    var fijas: [PiezaFijaDelChat] = []
    var fundidoMs: Double = 90
    var fundidoRelevoMs: Double = 110
    var esperaMs: Double = 600
    var adelanto: Double = 1
    var trasActualizar = false

    init() {}

    init(_ datos: [String: Any]) {
        activo = (datos["activo"] as? Bool) ?? false
        abierto = (datos["abierto"] as? Bool) ?? false
        vivo = (datos["vivo"] as? Bool) ?? false
        trasActualizar = (datos["trasActualizar"] as? Bool) ?? false
        corte = GeometriaDelChat.numero(datos["corte"])
        cajaTop = GeometriaDelChat.numero(datos["cajaTop"])
        padDelta = GeometriaDelChat.numero(datos["padDelta"])
        listaMax = GeometriaDelChat.numero(datos["listaMax"])
        franja = GeometriaDelChat.numero(datos["franja"])
        veloAlto = GeometriaDelChat.numero(datos["veloAlto"])
        if datos["fundidoMs"] != nil { fundidoMs = Double(GeometriaDelChat.numero(datos["fundidoMs"])) }
        if datos["fundidoRelevoMs"] != nil { fundidoRelevoMs = Double(GeometriaDelChat.numero(datos["fundidoRelevoMs"])) }
        if datos["esperaMs"] != nil { esperaMs = Double(GeometriaDelChat.numero(datos["esperaMs"])) }
        if datos["adelanto"] != nil { adelanto = Double(GeometriaDelChat.numero(datos["adelanto"])) }
        if let rgb = datos["velo"] as? [Any], rgb.count >= 3 {
            velo = UIColor(red: GeometriaDelChat.numero(rgb[0]) / 255, green: GeometriaDelChat.numero(rgb[1]) / 255,
                           blue: GeometriaDelChat.numero(rgb[2]) / 255, alpha: 1)
        }
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
    let vivo: Bool
}

final class CoberturaDelTeclado: NSObject, WKScriptMessageHandler {
    static let nombre = "mfTeclado"
    // [142] Un segundo nombre, sin mensajes propios: su sola existencia le dice a la pagina, ANTES del primer aviso, que
    // este binario mueve ademas la pagina viva (la geometria que manda cambia con eso).
    static let nombreVivo = "mfTecladoVivo"
    static let altoMinimo: CGFloat = 120

    private weak var webView: WKWebView?
    private var geometria = GeometriaDelChat()
    private var capa: UIView?
    private var capaSaliente: UIView?
    private var tiraCaja: UIView?
    private var tiraLista: UIView?
    private var baseAbierta = false
    private var destinoAbierto = false
    private var destinoActual: CGFloat = 0
    private var vivoCapturado = false
    private var padDeltaCapturado: CGFloat = 0
    private var listaMaxCapturado: CGFloat = 0
    private var ultimoAlto: CGFloat = 0
    private var idActual = 0
    private var animacionAcabada = false
    private var paginaAcabo = false
    private var veloEntrante: UIView?
    private var listaViajaEntera = false

    func conectar(_ nuevo: WKWebView) {
        if webView === nuevo { return }
        webView = nuevo
        let controlador = nuevo.configuration.userContentController
        controlador.removeScriptMessageHandler(forName: CoberturaDelTeclado.nombre)
        controlador.add(self, name: CoberturaDelTeclado.nombre)
        controlador.removeScriptMessageHandler(forName: CoberturaDelTeclado.nombreVivo)
        controlador.add(self, name: CoberturaDelTeclado.nombreVivo)
    }

    // Sin cobertura en vuelo el WebView tiene que estar en su sitio, siempre (se llama al activarse la escena).
    func asegurarEnSuSitio() {
        if capa == nil, let webView = webView, !webView.transform.isIdentity {
            webView.layer.removeAllAnimations()
            webView.transform = CGAffineTransform.identity
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == CoberturaDelTeclado.nombre, let datos = message.body as? [String: Any] else { return }
        let tipo = (datos["tipo"] as? String) ?? ""
        if tipo == "geometria" {
            geometria = GeometriaDelChat(datos)
            return
        }
        if tipo == "apagar" {
            geometria.activo = false
            retirarYa()
            return
        }
        let id = (datos["id"] as? NSNumber)?.intValue ?? -1
        guard id == idActual, capa != nil else { return }
        if tipo == "listo" {
            let mantener = (datos["mantener"] as? Bool) ?? false
            if vivoCapturado {
                // el layout final ya esta pintado debajo: lo que la pagina viva puede ensenar, que lo ensene ella
                if !mantener && listaViajaEntera { relevarTiras() }
            } else {
                paginaAcabo = true
                retirarSiProcede()
            }
        } else if tipo == "fin" {
            paginaAcabo = true
            retirarSiProcede()
        }
    }

    private func no(_ motivo: String) -> ResultadoDeCobertura {
        return ResultadoDeCobertura(cubierto: false, id: 0, motivo: motivo, vivo: false)
    }

    func alAvisoDelTeclado(tipo: String, alto: CGFloat, segundos: Double, curva: Int) -> ResultadoDeCobertura {
        let quiereAbierto = (tipo == "abre")
        if quiereAbierto && alto >= CoberturaDelTeclado.altoMinimo { ultimoAlto = alto }
        guard geometria.activo else { return no("apagado") }
        guard segundos > 0 else { return no("cero-ms") }
        guard let webView = webView else { return no("webview") }
        if quiereAbierto && alto < CoberturaDelTeclado.altoMinimo { return no("alto") }
        guard ultimoAlto >= CoberturaDelTeclado.altoMinimo else { return no("falta-alto") }

        let sinTiras = (tiraCaja == nil && tiraLista == nil)
        if sinTiras {
            // Sin cobertura, o con la pagina viva ya a la vista a media animacion (las tiras se relevaron): se captura lo
            // que HAY ahora. La pagina describe su layout de ahora en la geometria (la manda antes de cada `listo`).
            if geometria.abierto == quiereAbierto { return no("estado") }
            let desplazada = capa == nil ? 0 : (webView.layer.presentation()?.affineTransform().ty ?? webView.transform.ty)
            if !construirTiras(en: webView, desplazadas: desplazada) { return no("captura") }
            if let velo = veloEntrante {
                veloEntrante = nil
                UIView.animate(withDuration: 0.1, delay: 0, options: [.curveLinear, .allowUserInteraction], animations: { velo.alpha = 1 }, completion: nil)
            }
            baseAbierta = geometria.abierto
            vivoCapturado = geometria.vivo
            padDeltaCapturado = geometria.padDelta
            listaMaxCapturado = geometria.listaMax
            let recorridoNuevo = max(0, ultimoAlto - padDeltaCapturado)
            let destinoNuevo = baseAbierta ? recorridoNuevo : -recorridoNuevo
            if vivoCapturado {
                // D = S − destino, con S = donde estan ahora las tiras (= donde estaba la pagina)
                webView.layer.removeAllAnimations()
                UIView.performWithoutAnimation { webView.transform = CGAffineTransform(translationX: 0, y: desplazada - destinoNuevo) }
            }
        } else {
            // Re-apuntar con las tiras puestas (308 -> 335 al volver del selector, o cerrar a media subida): las MISMAS
            // tiras siguen desde donde esten —es lo que hace UIKit con el teclado— y la pagina salta, tapada, lo que
            // cambia el destino.
            let recorridoNuevo = max(0, ultimoAlto - padDeltaCapturado)
            var destinoNuevo: CGFloat = 0
            if quiereAbierto != baseAbierta { destinoNuevo = baseAbierta ? recorridoNuevo : -recorridoNuevo }
            let saltoDePagina = destinoActual - destinoNuevo
            if vivoCapturado && saltoDePagina != 0 {
                let ahora = webView.transform.ty
                UIView.performWithoutAnimation { webView.transform = CGAffineTransform(translationX: 0, y: ahora + saltoDePagina) }
            }
        }

        let recorrido = max(0, ultimoAlto - padDeltaCapturado)
        var destino: CGFloat = 0
        if quiereAbierto != baseAbierta { destino = baseAbierta ? recorrido : -recorrido }
        var destinoLista: CGFloat = 0
        if destino < 0 { destinoLista = -min(recorrido, listaMaxCapturado) }
        if destino > 0 { destinoLista = min(recorrido, listaMaxCapturado) }
        destinoActual = destino
        destinoAbierto = quiereAbierto
        // El relevo solo vale si la conversacion viaja ENTERA con la caja: la pagina viva se mueve de una pieza. Con la
        // lista quieta (anclada, respuesta en curso) o a medio recorrido (poco scroll al cerrar) las tiras se quedan hasta
        // el final, como en el 141 — al abrir, ademas, la tira quieta de la lista taparia la caja viva que sube por debajo.
        listaViajaEntera = abs(destinoLista - destino) < 0.5
        let factor = (quiereAbierto && geometria.adelanto > 0.3 && geometria.adelanto <= 1) ? geometria.adelanto : 1
        animar(destino: destino, destinoLista: destinoLista, segundos: segundos * factor, curva: curva)
        return ResultadoDeCobertura(cubierto: true, id: idActual, motivo: "ok", vivo: vivoCapturado)
    }

    // `keyboardWillShow` llega DENTRO del bloque de animacion de UIKit: una vista creada y colocada ahi dentro nace
    // animandose desde un marco vacio. Las tiras se montan sin animacion; lo unico que se anima es su `transform`.
    private func construirTiras(en webView: WKWebView, desplazadas: CGFloat) -> Bool {
        var hecho = false
        UIView.performWithoutAnimation {
            hecho = self.montarTiras(en: webView, desplazadas: desplazadas)
        }
        return hecho
    }

    private func montarTiras(en webView: WKWebView, desplazadas: CGFloat) -> Bool {
        capaSaliente?.removeFromSuperview()
        capaSaliente = nil
        let limites = webView.bounds
        let g = geometria
        guard g.cajaTop > 60, g.cajaTop < limites.height - 20, g.corte >= 0, g.corte < g.cajaTop - 20 else { return false }
        // Con la pagina viva viajando, la capa vive en la VENTANA (si fuera hija del WebView viajaria con el).
        // Se inserta justo ENCIMA de la raiz de la app y no al final: un modal presentado (el selector de fotos) cuelga
        // de la ventana como hermano, y la captura no debe taparlo mientras se va.
        var anfitrionOpcional: UIView? = webView
        if g.vivo { anfitrionOpcional = webView.window }
        guard let anfitrion = anfitrionOpcional else { return false }
        var raiz: UIView = webView
        while let padre = raiz.superview, padre !== anfitrion { raiz = padre }
        let rectLista = CGRect(x: 0, y: g.corte, width: limites.width, height: g.cajaTop - g.corte)
        let rectCaja = CGRect(x: 0, y: g.cajaTop, width: limites.width, height: limites.height - g.cajaTop)
        guard let lista = webView.resizableSnapshotView(from: rectLista, afterScreenUpdates: g.trasActualizar, withCapInsets: UIEdgeInsets.zero),
              let caja = webView.resizableSnapshotView(from: rectCaja, afterScreenUpdates: g.trasActualizar, withCapInsets: UIEdgeInsets.zero) else { return false }
        lista.frame = rectLista
        caja.frame = rectCaja
        lista.transform = CGAffineTransform(translationX: 0, y: desplazadas)
        caja.transform = CGAffineTransform(translationX: 0, y: desplazadas)

        if let existente = capa {
            // a media animacion: las fichas y el velo ya estan puestos y siguen valiendo; las tiras van DEBAJO de ellos
            existente.insertSubview(caja, at: 0)
            existente.insertSubview(lista, at: 0)
            tiraCaja = caja
            tiraLista = lista
            return true
        }

        let nueva = UIView(frame: anfitrion.bounds)
        nueva.isUserInteractionEnabled = false
        nueva.clipsToBounds = true
        nueva.backgroundColor = UIColor.clear
        nueva.addSubview(lista)
        nueva.addSubview(caja)
        // El velo de la cabecera (opaco sobre la barra de estado, transparente a la altura de las fichas): pintado aqui,
        // porque una captura llevaria dentro el texto que tenia debajo. Espejo del degradado de `.mobile-chat-header`.
        if let color = g.velo, g.veloAlto > 1 {
            let velo = UIView(frame: CGRect(x: 0, y: 0, width: limites.width, height: g.veloAlto))
            let degradado = CAGradientLayer()
            degradado.frame = velo.bounds
            degradado.colors = [color.cgColor, color.cgColor, color.withAlphaComponent(0.72).cgColor, color.withAlphaComponent(0).cgColor]
            let opacoHasta = min(0.6, max(0, Double(g.franja / g.veloAlto)))
            degradado.locations = [0, NSNumber(value: opacoHasta), 0.62, 1]
            velo.layer.addSublayer(degradado)
            nueva.addSubview(velo)
            if !g.abierto {
                // al ABRIR la tira de la conversacion lleva dentro el velo que habia: este entra fundido mientras aquel
                // se va (el fundido lo arranca `alAvisoDelTeclado`: aqui dentro las animaciones estan apagadas)
                velo.alpha = 0
                veloEntrante = velo
            }
        }
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
        if g.vivo { anfitrion.insertSubview(nueva, aboveSubview: raiz) } else { anfitrion.addSubview(nueva) }
        capa = nueva
        tiraCaja = caja
        tiraLista = lista
        return true
    }

    private func animar(destino: CGFloat, destinoLista: CGFloat, segundos: Double, curva: Int) {
        idActual += 1
        let id = idActual
        animacionAcabada = false
        paginaAcabo = false
        let caja = tiraCaja
        let lista = tiraLista
        let pagina: WKWebView? = vivoCapturado ? webView : nil
        let opciones = UIView.AnimationOptions(rawValue: UInt(max(0, curva)) << 16).union([.beginFromCurrentState, .allowUserInteraction])
        UIView.animate(withDuration: segundos, delay: 0, options: opciones, animations: {
            caja?.transform = CGAffineTransform(translationX: 0, y: destino)
            lista?.transform = CGAffineTransform(translationX: 0, y: destinoLista)
            pagina?.transform = CGAffineTransform.identity
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

    // [142] El relevo: la pagina viva ya coincide con las tiras, asi que se funden YA y el resto del viaje se ve en vivo.
    //   · al ABRIR se va la caja (debajo esta la caja viva, con su cursor; la barra de pestanas de la captura se funde
    //     con ella) y se QUEDA la conversacion: la ventana de lectura final es mas corta y no tiene lo que sale por arriba;
    //   · al CERRAR se van las dos: la pagina viva trae lo que asoma por arriba y la barra de pestanas que destapa el teclado.
    private func relevarTiras() {
        let fundido = max(0, min(0.3, geometria.fundidoRelevoMs / 1000))
        var reunidas: [UIView] = []
        if let caja = tiraCaja { reunidas.append(caja); tiraCaja = nil }
        if !destinoAbierto, let lista = tiraLista { reunidas.append(lista); tiraLista = nil }
        if reunidas.isEmpty { return }
        let salientes = reunidas
        if fundido <= 0 {
            for tira in salientes { tira.removeFromSuperview() }
            return
        }
        UIView.animate(withDuration: fundido, delay: 0, options: [.curveLinear, .beginFromCurrentState, .allowUserInteraction], animations: {
            for tira in salientes { tira.alpha = 0 }
        }, completion: { _ in
            for tira in salientes { tira.removeFromSuperview() }
        })
    }

    private func retirarSiProcede() {
        if animacionAcabada && paginaAcabo { retirar(fundido: geometria.fundidoMs / 1000) }
    }

    func retirarYa() {
        retirar(fundido: 0)
    }

    private func retirar(fundido: Double) {
        idActual += 1   // lo que quede pendiente de esta cobertura (reloj, plazo, mensajes de la pagina) ya no aplica
        if let webView = webView, vivoCapturado || !webView.transform.isIdentity {
            webView.layer.removeAllAnimations()
            webView.transform = CGAffineTransform.identity
        }
        guard let saliente = capa else { return }
        capa = nil
        tiraCaja = nil
        tiraLista = nil
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
