/**
 * [P1-PLAN-LOTE-848 · 2026-09-29] El binario iOS listo para la revisión de la App Store (auditoría del 29-sep:
 * filas 2.1, 12.1, 12.2 y 18.1; §A.3 y Parte 2).
 *
 * Estos ficheros viajan DENTRO del binario y ninguna OTA los corrige: un error aquí es un rechazo o un build roto que
 * se descubre en Codemagic (esta máquina no compila iOS). Por eso se PARSEAN, no se buscan con una regex:
 *  - `Info.plist` y `PrivacyInfo.xcprivacy`, con el parser XML (DOMParser) y la gramática de plist;
 *  - los 5 `InfoPlist.strings`, con la gramática de los .strings de Foundation;
 *  - `project.pbxproj`, con la gramática OpenStep que lee Xcode.
 * Cada parser tiene su caso roto, para que un parser que lo aceptara todo no pase por bueno.
 *
 * Cadenas de permiso (§A.3): dicen para qué es cada permiso —también el chat, la nevera y el modo voz— y NO nombran a
 * ningún proveedor de IA (los nombra la hoja de consentimiento, que sí se actualiza por OTA).
 * Manifiesto (Parte 2), cada motivo contra el código que lo usa (en el binario, por SPM):
 *  - UserDefaults CA92.1: `@capawesome/capacitor-live-update` (LiveUpdatePreferences.swift) guarda su estado para la app.
 *  - FileTimestamp C617.1: IONFilesystemLib (`@capacitor/filesystem`) lee creationDate/modificationDate con
 *    `attributesOfItem` (ficheros de la caché: exportación y tarjeta del día), e IONCameraLib los temporales de la foto.
 *  - FileTimestamp 3B52.1: IONCameraLib lee `creationDateKey` de la foto que la persona elige; su propio manifiesto lo
 *    declara, pero su Package.swift no lo empaqueta.
 *  - SystemBootTime 35F9.1: Alamofire (dependencia del plugin de OTA; SPM resuelve hoy 5.12.2) llama a
 *    `ProcessInfo.processInfo.systemUptime` en `WebSocketRequest.sendPing` para medir la latencia, y desde 5.12.1 su
 *    manifiesto ya no lo declara. No venía en la Parte 2 de la auditoría: se añade porque es verdad en el binario.
 * Solo iPhone (fila 18.1): `TARGETED_DEVICE_FAMILY = "1"`. El español con su propio `es.lproj` y `developmentRegion = es`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..', '..');
const IOS = 'ios/App/App';
const leerBytes = (rel) => readFileSync(resolve(RAIZ, rel));
const leer = (rel) => leerBytes(rel).toString('utf8');
const IDIOMAS = ['es', 'en', 'pt-BR', 'fr', 'it'];
const PROVEEDORES = ['DeepSeek', 'OpenAI', 'Google', 'Gemini'];

// §A.3 de la auditoría, tal cual (español = Info.plist y es.lproj).
const A3 = {
    NSCameraUsageDescription: {
        es: "Bioboros usa la cámara para que fotografíes tus comidas o tu nevera y la IA las analice, y para enviar fotos al coach en el chat.",
        en: "Bioboros uses the camera so you can photograph your meals or your fridge for AI analysis, and send photos to the coach in the chat.",
        'pt-BR': "O Bioboros usa a câmera para você fotografar suas refeições ou sua geladeira para análise por IA e enviar fotos ao coach no chat.",
        fr: "Bioboros utilise l’appareil photo pour que vous photographiiez vos repas ou votre frigo afin que l’IA les analyse, et pour envoyer des photos au coach dans le chat.",
        it: "Bioboros usa la fotocamera per fotografare i tuoi pasti o il tuo frigo e farli analizzare dall’IA, e per inviare foto al coach nella chat.",
    },
    NSPhotoLibraryUsageDescription: {
        es: "Bioboros abre tus fotos solo para que elijas imágenes de comidas o de tu nevera para que la IA las analice, o para enviarlas al coach.",
        en: "Bioboros opens your photos only so you can pick images of meals or your fridge for AI analysis, or send them to the coach.",
        'pt-BR': "O Bioboros abre suas fotos só para você escolher imagens de refeições ou da sua geladeira para análise por IA, ou enviá-las ao coach.",
        fr: "Bioboros ouvre vos photos uniquement pour que vous choisissiez des images de repas ou de votre frigo à faire analyser par l’IA, ou à envoyer au coach.",
        it: "Bioboros apre le tue foto solo per scegliere immagini di pasti o del tuo frigo da far analizzare all’IA, o da inviare al coach.",
    },
    NSPhotoLibraryAddUsageDescription: {
        es: "Bioboros guarda en tus Fotos solo las imágenes que tú decides guardar, como la tarjeta de tu día.",
        en: "Bioboros saves to Photos only the images you choose to save, such as your daily summary card.",
        'pt-BR': "O Bioboros salva em Fotos só as imagens que você escolher salvar, como o cartão do seu dia.",
        fr: "Bioboros enregistre dans Photos uniquement les images que vous choisissez d’enregistrer, comme la carte de votre journée.",
        it: "Bioboros salva in Foto solo le immagini che scegli di salvare, come la scheda della tua giornata.",
    },
    NSMicrophoneUsageDescription: {
        es: "Bioboros usa el micrófono para que dictes tus mensajes o hables con el coach en el modo voz.",
        en: "Bioboros uses the microphone so you can dictate messages or talk to the coach in voice mode.",
        'pt-BR': "O Bioboros usa o microfone para você ditar mensagens ou falar com o coach no modo voz.",
        fr: "Bioboros utilise le micro pour que vous dictiez vos messages ou parliez au coach en mode vocal.",
        it: "Bioboros usa il microfono per dettare i messaggi o parlare con il coach in modalità vocale.",
    },
    NSSpeechRecognitionUsageDescription: {
        es: "Bioboros convierte tu voz en texto con el reconocimiento de voz de Apple para escribir tus mensajes al coach.",
        en: "Bioboros turns your voice into text using Apple speech recognition to write your messages to the coach.",
        'pt-BR': "O Bioboros converte sua voz em texto com o reconhecimento de fala da Apple para escrever suas mensagens ao coach.",
        fr: "Bioboros transforme votre voix en texte grâce à la reconnaissance vocale d’Apple pour écrire vos messages au coach.",
        it: "Bioboros trasforma la tua voce in testo con il riconoscimento vocale di Apple per scrivere i tuoi messaggi al coach.",
    },
};
const CLAVES = Object.keys(A3);

// ── Parsers ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const elementos = (nodo) => Array.from(nodo.childNodes).filter((c) => c.nodeType === 1);

function valorPlist(nodo) {
    switch (nodo.nodeName) {
        case 'dict': {
            const hijos = elementos(nodo);
            if (hijos.length % 2) throw new SyntaxError('dict con una clave sin valor');
            const out = {};
            for (let i = 0; i < hijos.length; i += 2) {
                if (hijos[i].nodeName !== 'key') throw new SyntaxError(`se esperaba <key>, llegó <${hijos[i].nodeName}>`);
                const clave = hijos[i].textContent;
                if (Object.prototype.hasOwnProperty.call(out, clave)) throw new SyntaxError(`clave repetida: ${clave}`);
                out[clave] = valorPlist(hijos[i + 1]);
            }
            return out;
        }
        case 'array': return elementos(nodo).map(valorPlist);
        case 'string': return nodo.textContent;
        case 'integer': return Number(nodo.textContent);
        case 'true': return true;
        case 'false': return false;
        default: throw new SyntaxError(`tipo de plist no soportado: <${nodo.nodeName}>`);
    }
}

function parsearPlist(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new SyntaxError('XML mal formado');
    if (doc.documentElement.nodeName !== 'plist') throw new SyntaxError('la raíz no es <plist>');
    const [raiz, ...sobra] = elementos(doc.documentElement);
    if (!raiz || sobra.length) throw new SyntaxError('<plist> debe tener exactamente un valor');
    return valorPlist(raiz);
}

// Formato .strings de Foundation: comentarios /* */ y //, pares "clave" = "valor"; con escapes \" \\ \' \n \t \r \Uxxxx.
function parsearStrings(texto) {
    let i = 0;
    const n = texto.length;
    const pares = [];
    const fallo = (msg) => { throw new SyntaxError(`${msg} (posición ${i})`); };
    const saltar = () => {
        for (;;) {
            if (i < n && ' \t\n'.includes(texto[i])) { i += 1; continue; }
            if (texto.startsWith('/*', i)) { const j = texto.indexOf('*/', i + 2); if (j < 0) fallo('comentario sin cerrar'); i = j + 2; continue; }
            if (texto.startsWith('//', i)) { const j = texto.indexOf('\n', i); i = j < 0 ? n : j + 1; continue; }
            return;
        }
    };
    const cadena = () => {
        if (texto[i] !== '"') fallo('se esperaba una cadena entre comillas');
        i += 1;
        let out = '';
        while (i < n) {
            const c = texto[i];
            if (c === '"') { i += 1; return out; }
            if (c === '\n') fallo('salto de línea dentro de una cadena');
            if (c === '\\') {
                const e = texto[i + 1];
                if (e === '"' || e === '\\' || e === "'") { out += e; i += 2; continue; }
                if (e === 'n' || e === 't' || e === 'r') { out += { n: '\n', t: '\t', r: '\r' }[e]; i += 2; continue; }
                if (e === 'U' && /^[0-9a-fA-F]{4}$/.test(texto.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(texto.slice(i + 2, i + 6), 16)); i += 6; continue; }
                fallo(`escape desconocido \\${e}`);
            }
            out += c;
            i += 1;
        }
        return fallo('cadena sin cerrar');
    };
    for (;;) {
        saltar();
        if (i >= n) return pares;
        const clave = cadena();
        saltar();
        if (texto[i] !== '=') fallo(`falta «=» tras "${clave}"`);
        i += 1;
        saltar();
        const valor = cadena();
        saltar();
        if (texto[i] !== ';') fallo(`falta «;» tras el valor de "${clave}"`);
        i += 1;
        pares.push([clave, valor]);
    }
}

// Gramática OpenStep de project.pbxproj: { clave = valor; } ( valor, … ) "cadena" o palabra, y comentarios.
function parsearPbxproj(texto) {
    let i = 0;
    const n = texto.length;
    const PALABRA = /[A-Za-z0-9_$/:.+-]+/y;
    const fallo = (msg) => { throw new SyntaxError(`${msg} (posición ${i}: ${JSON.stringify(texto.slice(i, i + 24))})`); };
    const saltar = () => {
        for (;;) {
            if (i < n && /\s/.test(texto[i])) { i += 1; continue; }
            if (texto.startsWith('/*', i)) { const j = texto.indexOf('*/', i + 2); if (j < 0) fallo('comentario sin cerrar'); i = j + 2; continue; }
            if (texto.startsWith('//', i)) { const j = texto.indexOf('\n', i); i = j < 0 ? n : j + 1; continue; }
            return;
        }
    };
    const cadena = () => {
        saltar();
        if (texto[i] === '"') {
            i += 1;
            let out = '';
            while (i < n && texto[i] !== '"') {
                if (texto[i] === '\\') { out += texto[i + 1]; i += 2; } else { out += texto[i]; i += 1; }
            }
            if (i >= n) fallo('cadena sin cerrar');
            i += 1;
            return out;
        }
        PALABRA.lastIndex = i;
        const m = PALABRA.exec(texto);
        if (!m) fallo('valor no reconocido');
        i += m[0].length;
        return m[0];
    };
    const valor = () => {
        saltar();
        if (texto[i] === '{') {
            i += 1;
            const out = {};
            for (;;) {
                saltar();
                if (texto[i] === '}') { i += 1; return out; }
                const clave = cadena();
                saltar();
                if (texto[i] !== '=') fallo(`falta «=» tras ${clave}`);
                i += 1;
                if (Object.prototype.hasOwnProperty.call(out, clave)) fallo(`clave repetida: ${clave}`);
                out[clave] = valor();
                saltar();
                if (texto[i] !== ';') fallo(`falta «;» tras el valor de ${clave}`);
                i += 1;
            }
        }
        if (texto[i] === '(') {
            i += 1;
            const out = [];
            for (;;) {
                saltar();
                if (texto[i] === ')') { i += 1; return out; }
                out.push(valor());
                saltar();
                if (texto[i] === ',') { i += 1; continue; }
                if (texto[i] !== ')') fallo('falta «,» o «)»');
            }
        }
        return cadena();
    };
    const raiz = valor();
    saltar();
    if (i !== n) fallo('texto sobrante tras la raíz');
    return raiz;
}

const utf8Estricto = (rel) => {
    const bytes = leerBytes(rel);
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);   // lanza con un byte inválido
    expect(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, `${rel}: sin BOM`).toBe(false);
    expect(texto.includes('\r'), `${rel}: finales de línea LF`).toBe(false);
    expect(texto.normalize('NFC'), `${rel}: NFC`).toBe(texto);
    return texto;
};

const sinProveedores = (texto, donde) => {
    for (const p of PROVEEDORES) expect(texto.toLowerCase().includes(p.toLowerCase()), `${donde} nombra a ${p}`).toBe(false);
};

// ── Los parsers no aceptan cualquier cosa ───────────────────────────────────────────────────────────────────────────

describe('[848] los parsers rechazan lo roto', () => {
    it('plist', () => {
        expect(() => parsearPlist('<plist><dict><key>a</key></dict></plist>')).toThrow(SyntaxError);
        expect(() => parsearPlist('<plist><dict><key>a</key><string>x</dict></plist>')).toThrow(SyntaxError);
        expect(parsearPlist('<plist><dict><key>a</key><array><true/></array></dict></plist>')).toEqual({ a: [true] });
    });
    it('.strings', () => {
        expect(() => parsearStrings('"a" = "b"')).toThrow(/falta «;»/);
        expect(() => parsearStrings('"a" = "b;\n')).toThrow(SyntaxError);
        expect(() => parsearStrings('"a" = "b\\q";')).toThrow(/escape desconocido/);
        expect(parsearStrings('/* c */\n"a" = "l\\"x";\n')).toEqual([['a', 'l"x']]);
    });
    it('pbxproj', () => {
        expect(() => parsearPbxproj('{ a = b }')).toThrow(/falta «;»/);
        expect(() => parsearPbxproj('{ a = ( b, c ; }')).toThrow(SyntaxError);
        expect(() => parsearPbxproj('{ a = b; } }')).toThrow(/sobrante/);
        expect(parsearPbxproj('// !$*UTF8*$!\n{ a = "1"; b = (x, "y z",); }')).toEqual({ a: '1', b: ['x', 'y z'] });
    });
});

// ── Info.plist e InfoPlist.strings (§A.3, fila 2.1) ─────────────────────────────────────────────────────────────────

describe('[848] cadenas de permiso: exactas, en los 5 idiomas y sin proveedores', () => {
    it('Info.plist: el español de §A.3, con el español como región de desarrollo', () => {
        const texto = utf8Estricto(`${IOS}/Info.plist`);
        const info = parsearPlist(texto);
        for (const clave of CLAVES) expect(info[clave], clave).toBe(A3[clave].es);
        expect(info.CFBundleDevelopmentRegion).toBe('es');
        expect([...info.CFBundleLocalizations].sort()).toEqual([...IDIOMAS].sort());
        expect(info.ITSAppUsesNonExemptEncryption).toBe(false);
        sinProveedores(texto, 'Info.plist');
    });

    it.each(IDIOMAS)('%s.lproj/InfoPlist.strings: las 5 cadenas de §A.3, sintaxis .strings y UTF-8', (lang) => {
        const rel = `${IOS}/${lang}.lproj/InfoPlist.strings`;
        const cadenas = utf8Estricto(rel);
        const pares = parsearStrings(cadenas);
        const claves = pares.map(([k]) => k);
        expect(new Set(claves).size, 'sin claves repetidas').toBe(claves.length);
        expect([...claves].sort()).toEqual([...CLAVES].sort());
        const valores = Object.fromEntries(pares);
        for (const clave of CLAVES) expect(valores[clave], `${lang} ${clave}`).toBe(A3[clave][lang]);
        sinProveedores(cadenas, rel);
    });
});

// ── PrivacyInfo.xcprivacy (Parte 2, filas 12.1 y 12.2) ──────────────────────────────────────────────────────────────

describe('[848] manifiesto de privacidad', () => {
    const leerManifiesto = () => parsearPlist(utf8Estricto(`${IOS}/PrivacyInfo.xcprivacy`));

    it('sin rastreo ni dominios de rastreo', () => {
        const manifiesto = leerManifiesto();
        expect(manifiesto.NSPrivacyTracking).toBe(false);
        expect(manifiesto.NSPrivacyTrackingDomains).toEqual([]);
    });

    it('declara los datos que recoge (los mismos que la etiqueta de App Store Connect), ninguno para rastrear', () => {
        const tipos = leerManifiesto().NSPrivacyCollectedDataTypes;
        expect(Array.isArray(tipos) && tipos.length > 0).toBe(true);
        const nombres = tipos.map((t) => t.NSPrivacyCollectedDataType);
        expect(new Set(nombres).size).toBe(nombres.length);
        for (const t of tipos) {
            expect(t.NSPrivacyCollectedDataType).toMatch(/^NSPrivacyCollectedDataType[A-Za-z]+$/);
            expect(typeof t.NSPrivacyCollectedDataTypeLinked).toBe('boolean');
            expect(t.NSPrivacyCollectedDataTypeTracking).toBe(false);
            expect(t.NSPrivacyCollectedDataTypePurposes.length).toBeGreaterThan(0);
            for (const p of t.NSPrivacyCollectedDataTypePurposes) expect(p).toMatch(/^NSPrivacyCollectedDataTypePurpose[A-Za-z]+$/);
        }
        for (const clave of ['NSPrivacyCollectedDataTypeHealth', 'NSPrivacyCollectedDataTypePhotosorVideos', 'NSPrivacyCollectedDataTypeUserID']) {
            expect(nombres).toContain(clave);
        }
    });

    it('los motivos de las API que el binario usa: UserDefaults, marcas de tiempo de archivo y hora de arranque', () => {
        const apis = Object.fromEntries(leerManifiesto().NSPrivacyAccessedAPITypes
            .map((e) => [e.NSPrivacyAccessedAPIType, e.NSPrivacyAccessedAPITypeReasons]));
        expect(apis.NSPrivacyAccessedAPICategoryUserDefaults).toEqual(['CA92.1']);
        expect(apis.NSPrivacyAccessedAPICategoryFileTimestamp).toEqual(expect.arrayContaining(['C617.1', '3B52.1']));
        expect(apis.NSPrivacyAccessedAPICategorySystemBootTime).toEqual(['35F9.1']);
    });
});

// ── project.pbxproj (filas 2.1 y 18.1) ──────────────────────────────────────────────────────────────────────────────

describe('[848] proyecto de Xcode', () => {
    let texto;
    let objetos;
    let raiz;
    beforeAll(() => {
        texto = leer('ios/App/App.xcodeproj/project.pbxproj');
        const proyecto = parsearPbxproj(texto);
        objetos = proyecto.objects;
        raiz = objetos[proyecto.rootObject];
    });

    it('la gramática de Xcode lo acepta y todas las referencias existen', () => {
        expect(raiz.isa).toBe('PBXProject');
        const huerfanas = [...new Set(texto.match(/\b[0-9A-F]{24}\b/g))].filter((id) => !objetos[id]);
        expect(huerfanas).toEqual([]);
    });

    it('developmentRegion = es y el español entre las regiones conocidas', () => {
        expect(raiz.developmentRegion).toBe('es');
        expect(raiz.knownRegions).toEqual(expect.arrayContaining(IDIOMAS));
    });

    it('es.lproj/InfoPlist.strings en el grupo de variantes de InfoPlist.strings, como los otros cuatro', () => {
        const grupos = Object.values(objetos).filter((o) => o.isa === 'PBXVariantGroup' && o.name === 'InfoPlist.strings');
        expect(grupos).toHaveLength(1);
        const hijos = grupos[0].children.map((id) => objetos[id]);
        expect(hijos.every((f) => f.isa === 'PBXFileReference' && f.lastKnownFileType === 'text.plist.strings')).toBe(true);
        expect(Object.fromEntries(hijos.map((f) => [f.name, f.path]))).toEqual(
            Object.fromEntries(IDIOMAS.map((l) => [l, `${l}.lproj/InfoPlist.strings`])),
        );
        for (const l of IDIOMAS) expect(existsSync(resolve(RAIZ, IOS, `${l}.lproj/InfoPlist.strings`)), l).toBe(true);
    });

    it('solo iPhone: TARGETED_DEVICE_FAMILY = "1" en las dos configuraciones del target', () => {
        const target = Object.values(objetos).find((o) => o.isa === 'PBXNativeTarget' && o.name === 'App');
        const configuraciones = objetos[target.buildConfigurationList].buildConfigurations.map((id) => objetos[id]);
        expect(configuraciones.map((c) => c.name).sort()).toEqual(['Debug', 'Release']);
        for (const c of configuraciones) expect(c.buildSettings.TARGETED_DEVICE_FAMILY, c.name).toBe('1');
        expect(texto).not.toContain('"1,2"');
    });
});
