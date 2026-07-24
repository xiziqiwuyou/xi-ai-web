# Markdown Rendering Research

## Local Evidence

- `react-markdown@10.1.0` supports custom intrinsic components and remark/rehype plugins without requiring raw HTML or `dangerouslySetInnerHTML`.
- `remark-math@6.0.0` parses inline `$...$` and display `$$...$$` syntax.
- `rehype-katex@7.0.1` renders `language-math`, `math-inline`, and `math-display` nodes and requires the matching KaTeX stylesheet.
- `rehype-katex@7.0.1` resolves KaTeX from the `0.16.x` range, so the direct CSS/runtime dependency is pinned to `katex@0.16.47` to avoid duplicate renderer and stylesheet versions.
- Existing `KnowledgeCloudPortal.tsx` provides the browser Clipboard API plus `document.execCommand("copy")` fallback pattern needed for HTTP IP deployments.

## Security Decision

Keep `rehype-raw` out of the Chat pipeline. User/provider content is transformed to React elements by `react-markdown`; raw HTML must not become executable DOM. Code blocks are presentation-only and never evaluated.
