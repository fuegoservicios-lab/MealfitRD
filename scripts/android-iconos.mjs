// [P1-PLAN-LOTE-152 · 2026-09-21] Los iconos de Android salen del MISMO fichero que los de iOS.
//
// La plantilla de Capacitor deja su propio logo, y una app con el logo de otro producto en el cajón del
// teléfono es lo primero que ve un tester. Se generan desde `ios/App/App/Assets.xcassets/.../AppIcon-512@2x.png`
// (1024×1024) para que las dos plataformas no puedan divergir: si un día cambia el icono, cambia el de iOS y
// este script vuelve a derivar los de Android.
//
// Qué escribe, y por qué son tres cosas distintas:
//   · ic_launcher.png / ic_launcher_round.png  — el icono LEGADO (Android 7 y anteriores, y algunos lanzadores).
//   · ic_launcher_foreground.png               — la capa de delante del icono ADAPTATIVO (Android 8+). Va en un
//     lienzo de 108 dp del que el sistema recorta el centro: los bordes los puede comer una máscara circular,
//     cuadrada o de gota según el lanzador. Por eso el dibujo se encoge al 62 % y se centra — lo que se sale de
//     esa «zona segura» no está garantizado que se vea.
//   · el color de fondo del adaptativo se queda en `values/ic_launcher_background.xml`.
//
// No se usa `sharp` (no está en el proyecto y no voy a meter una dependencia nativa por un icono): se hace con
// el mismo Python del entorno, que ya trae Pillow. Este fichero solo documenta y lanza.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PY = process.env.MEALFIT_PYTHON
    || 'C:/Users/angel/miniconda3/envs/mealfit/python.exe';
const raiz = path.resolve(process.cwd());
const script = path.join(raiz, 'scripts', 'android_iconos.py');

if (!existsSync(script)) {
    console.error(`No encuentro ${script}`);
    process.exit(1);
}
execFileSync(PY, [script], { stdio: 'inherit', cwd: raiz });
