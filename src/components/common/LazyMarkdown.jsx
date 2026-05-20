// [P3-LAZY-MARKDOWN · 2026-05-12] Wrapper que lazy-loadea `react-markdown`.
// [P1-MARKDOWN-SANITIZE · 2026-05-19] Sanitización XSS via rehype-sanitize.
//
// Pre-fix (P3-LAZY-MARKDOWN solo): `import ReactMarkdown from 'react-markdown'`
// static en AgentPage.jsx / MessageBubble.jsx / ChatWidget.jsx hacía que
// `react-markdown` + sus deps (`remark`, `mdast-util-*`, ~60KB gzip) entraran
// al chunk de `AgentPage-*.js` (174 KB). La biblioteca solo se necesita
// cuando el agente efectivamente devuelve markdown.
//
// Pre-fix (P1-MARKDOWN-SANITIZE): ReactMarkdown renderiza HTML inline si el
// markdown lo contiene (e.g. `<script>` o `<img onerror=...>` embebido). El
// backend produce el markdown desde Gemini, pero `vision_agent` puede
// procesar imágenes adversarias inyectando texto malicioso al chat context.
// Defensa-en-profundidad simétrica a P0-AGENT-1 (override de user_id) pero
// del lado output. Sanitize por defecto whitelist segura de rehype-sanitize
// (`defaultSchema`): permite headings, lists, code, links http(s), pero
// drops `<script>`, event handlers `on*`, `javascript:` URIs, `<iframe>`.
//
// Diseño:
//   - `React.lazy(async () => { … })` carga `react-markdown` + `rehype-sanitize`
//     en paralelo (`Promise.all`) — mismo chunk async, un solo round-trip.
//     Vite emite ambos en el mismo `react-markdown-*.js`.
//   - El componente lazy-loaded fija `rehypePlugins={[rehypeSanitize]}` y
//     mergea con cualquier `rehypePlugins` que el caller pase (extensión, no
//     reemplazo). Si el caller necesita un plugin extra (e.g. rehype-highlight),
//     ambos se aplican: sanitize PRIMERO (whitelist), luego el resto.
//   - `<Suspense fallback>`: durante el primer fetch del chunk (~50-150ms en
//     buena red), renderiza el `children` como plain text con
//     `white-space: pre-wrap` para preservar saltos de línea. UX correcta
//     porque el contenido raw ES texto plano legible.
//   - Tras el primer mount, el chunk queda en caché (Service Worker P2-PWA
//     + browser cache) — siguientes renderizaciones instantáneas.
//
// Anchor: P3-LAZY-MARKDOWN | P1-MARKDOWN-SANITIZE.
import React, { Suspense, lazy } from 'react';

const ReactMarkdownWithSanitize = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: rehypeSanitize }] = await Promise.all([
    import('react-markdown'),
    import('rehype-sanitize'),
  ]);
  const Wrapped = ({ children, rehypePlugins, ...props }) => {
    // [P1-MARKDOWN-SANITIZE · 2026-05-19] sanitize SIEMPRE primero. Si el
    // caller pasa `rehypePlugins`, se concatenan después (sanitize ya filtró
    // el HTML inseguro antes de que ningún otro plugin lo vea).
    const plugins = [rehypeSanitize, ...(Array.isArray(rehypePlugins) ? rehypePlugins : [])];
    return (
      <ReactMarkdown rehypePlugins={plugins} {...props}>
        {children}
      </ReactMarkdown>
    );
  };
  return { default: Wrapped };
});

export default function LazyMarkdown({ children, ...props }) {
  return (
    <Suspense
      fallback={
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {children}
        </div>
      }
    >
      <ReactMarkdownWithSanitize {...props}>{children}</ReactMarkdownWithSanitize>
    </Suspense>
  );
}
