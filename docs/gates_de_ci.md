# Los gates de CI del frontend

[P1-CI-GATE · 2026-08-18] Qué vigila cada gate, **por qué existe** y cómo
recalibrarlo sin desarmarlo. Un gate cuyo motivo no está escrito se acaba
subiendo hasta que deja de molestar; entonces ya no protege, solo cuesta.

## La tabla

| Gate | Comando | Qué cae si falta |
|---|---|---|
| Lint, techo global | `npx eslint . --max-warnings 60` (2026-09-04; era 158→66) | Deriva silenciosa: de 148 a 180 en un mes sin que nadie lo viera. |
| Lint, **techo por regla** | `npm run lint:count -- --gate` | El techo global es fungible: arreglar un aviso de estilo libera hueco para uno de hooks. |
| Tipos | `npm run typecheck` | — |
| Código muerto | `node scripts/huerfanos.mjs --gate` | `ChatWidget.jsx` vivió 829 líneas sostenido por sus propios tests. |
| Unitarios | `npm test` | — |
| i18n **estricto** | `npm run i18n:check:strict` | La clave ES el texto español: editar un copy huérfana su traducción en 4 idiomas **en silencio**. |
| Tope del bundle del agente | `npm run check:bundle-size` | — |
| **Presupuestos de arranque** | `npm run check:presupuestos` | El peso del arranque empeora sin que nadie lo decida. |
| Vulnerabilidades | `node scripts/audit-gate.mjs` | Con excepciones **caducables**: una excepción vencida pone el gate en rojo. |
| Contrato de entorno | `node scripts/env-gate.mjs` | Todo lo `VITE_` acaba **dentro del bundle**, en texto plano. |
| **E2E en 3 motores** | `npx playwright test --project=<motor>` | WebKit es Safari y todo iOS, y no hay forma de probarlo a mano desde Windows. |

## Cómo recalibrar cada uno

### El techo de lint

Dos números, y se mueven juntos: `--max-warnings` en `ci.yml` y `CEILING` en
`scripts/lint-count.mjs`. **Baja cuando bajes el código**; sube solo cuando un
bump del toolchain traiga reglas nuevas, y entonces escribe cuál y por qué,
como están escritas las anteriores.

El de **por regla** (`TECHOS_POR_REGLA`) es el que de verdad frena la deriva.
Una regla que no aparece en ese objeto tiene techo 0: si un plugin nuevo trae
reglas, salen a la cara en vez de esconderse bajo el margen de las demás. Eso
último no es hipotético — es exactamente lo que pasó cuando
`eslint-plugin-react-hooks@7` añadió `set-state-in-effect` y dejó el job rojo
semanas sin que nadie supiera por qué.

Sobre los bloques que quedan abiertos:

- `no-restricted-syntax` (92): consolidar `localStorage` en `safeLocalStorage`.
  **Medido: los 92 ya están dentro de un `try/catch`.** No son 92 caídas
  latentes, son 92 copias de la misma guarda; el valor de cerrarlo es de SSOT,
  no de seguridad. Fichero a fichero, y el techo baja con cada uno.
- `react-hooks/exhaustive-deps` (24) y `set-state-in-effect` (16): **no se tocan
  en barrido.** Añadir la dependencia que falta puede ser justo lo que provoque
  el bucle infinito que el autor evitó omitiéndola. De uno en uno y con la
  pantalla delante.

### Los presupuestos

`TECHOS` en `scripts/presupuestos.mjs`, en kB gzip. Miden lo que el navegador
debe bajar antes de pintar: el módulo de entrada, sus `modulepreload` —que **no
son opcionales**, van a prioridad alta en la misma tanda— y las hojas de estilo.

Antes de subir un techo, mira **qué** entró. La causa casi siempre es un import
nuevo en un fichero que ya estaba en el camino crítico, y esos no crean ficheros
nuevos: por eso no se ven en el `git diff`. Esta misma tanda vio a `@sentry`
entrar al entry por cinco puertas distintas y costó una jornada encontrarlo.

### Las excepciones del gate de vulnerabilidades

Llevan `dueno`, `caduca` y `mitigacion`. **Una excepción vencida pone el gate en
rojo**, que es el único diseño que impide que «lo miramos la semana que viene»
se convierta en permanente.

## E2E: lo que hay que saber antes de tocarlo

**La suite no sale a la red.** `e2e/fixtures.js` responde localmente todo lo que
no sea el servidor de la prueba. No es una optimización: antes cada carga de
página llamaba al servicio de autenticación **de producción**, y al pasar de uno
a tres motores nos devolvió `429`. Con un motor cabía bajo el límite, así que
llevaba meses ocurriendo sin que nada lo dijera.

Se **responde**, no se aborta: una petición abortada deja su propio
`console.error` en el navegador, y hay tests cuya aserción es que no haya
ninguno. El remedio habría fabricado el síntoma.

**Un motor por job** en CI, con `fail-fast: false`. Corren en paralelo y, sobre
todo, el informe dice cuál falla sin abrir el log.

**Qué NO cubre:** el flujo autenticado. Requiere fixtures de sesión reales, y
eso es otro trabajo. Lo que hay es el camino público.

## axe: las reglas desactivadas

Una sola, y con motivo: `meta-viewport`. El `user-scalable=no` es decisión del
dueño, **ya revertida una vez** por accesibilidad y vuelta a poner. Con la regla
encendida el gate estaría rojo en todas las rutas por algo que no se va a
cambiar, y un gate siempre rojo se acaba ignorando entero. Cambiarlo exige
reabrir la decisión de producto, no editar la línea.

Verificado que axe hace su trabajo: con violaciones inyectadas a propósito
(`image-alt`, `color-contrast`) las detecta, y sin desactivar nada la **única**
violación en `/login` es esa `meta-viewport`.
