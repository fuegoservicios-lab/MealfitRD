// [P3-LAZY-MARKDOWN · 2026-05-12] Wrapper que lazy-loadea `react-markdown`.
//
// Pre-fix: `import ReactMarkdown from 'react-markdown'` static en
// AgentPage.jsx / MessageBubble.jsx / ChatWidget.jsx hacía que `react-markdown`
// + sus deps (`remark`, `mdast-util-*`, ~60KB gzip) entraran al chunk de
// `AgentPage-*.js` (174 KB). La biblioteca solo se necesita cuando el agente
// efectivamente devuelve markdown — para el welcome banner / mensajes de
// loading / errores plain-text es overhead muerto.
//
// Diseño:
//   - `React.lazy(() => import('react-markdown'))` crea un chunk async
//     separado (`react-markdown-*.js`). Vite lo emite automáticamente.
//   - `<Suspense fallback>`: durante el primer fetch del chunk (~50-150ms en
//     buena red), renderiza el `children` como plain text con
//     `white-space: pre-wrap` para preservar saltos de línea. UX correcta
//     porque el contenido raw ES texto plano legible (`# Heading` se ve
//     como literal pero no se rompe).
//   - Tras el primer mount, el chunk queda en caché (Service Worker P2-PWA
//     + browser cache) — las siguientes renderizaciones son instantáneas.
//
// Anchor: P3-LAZY-MARKDOWN.
import React, { Suspense, lazy } from 'react';

const ReactMarkdown = lazy(() => import('react-markdown'));

export default function LazyMarkdown({ children, ...props }) {
  return (
    <Suspense
      fallback={
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {children}
        </div>
      }
    >
      <ReactMarkdown {...props}>{children}</ReactMarkdown>
    </Suspense>
  );
}
