# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Khattat (خطاط) is an Arabic calligraphy editor that runs entirely in the browser (React 19 + TypeScript + Vite, state in Zustand + Immer, shaping with HarfBuzz via `harfbuzzjs` WASM). The UI is Arabic and right-to-left, so all user-facing strings (labels, toasts, error messages) are in Arabic. Code, comments and identifiers are in English.

## Commands

Requires Node.js 20+.

```bash
npm run dev          # Vite dev server on http://127.0.0.1:5173 (strict port)
npm run typecheck    # tsc --noEmit (no separate linter; tsconfig has noUnusedLocals/Parameters)
npm test             # vitest run (all tests in tests/**/*.test.ts, node environment)
npx vitest run tests/segments.test.ts            # one file
npx vitest run tests/engine.test.ts -t "kashida" # tests matching a name
npm run build        # typecheck + vite build into dist/
npm start            # serve dist/ via server.mjs on 127.0.0.1:4173 (prod CSP headers)
```

`KLX_SAMPLES=/path/to/samples npm test` also runs the KLX parser against a folder of real legacy files (that suite is skipped otherwise).

## Architecture

Data flows one way: **model** (plain JSON document) → **engine** (pure geometry from model + loaded font) → **render** (SVG, shared by editor and export) → **ui**. The store holds only the document and editor state, never derived geometry.

- `src/model/types.ts` is the document format (`KhattatDoc` → `Page` → `DocObject`). All lengths are millimetres in page space, y grows downward. Three object types: `text` (HarfBuzz-shaped line), `mark` (standalone diacritic/dot/sign, optionally attached to a line via `ownerId` so it moves with it), `strokes` (prototype broad-nib pen line built from hand-defined letter skeletons in `engine/strokeLetters.ts` + `engine/nib.ts`).
- `src/engine/layout.ts` `computeTextGeometry` is the core pipeline for a text line: kashida placement (`arabic.ts`) → per-segment variant features turned into ranged HarfBuzz features (`feature@start:end`) → `shapeText` (`shape.ts`) → per-glyph overrides, GSUB alternates (`gsub.ts`), letter lengthening by cutting and stretching the outline (`stretch.ts`) → text path (arc/circle/wave) → repeat/mirror copies. `textGeometry` caches results in a `WeakMap` keyed by object identity, which relies on Immer producing a new object whenever a line changes — never mutate document objects outside a store recipe.
- **Per-letter edit keys.** `TextObject.glyphs`, `kashidaAt` and `segVariants` are keyed by UTF-16 indices into `text` (glyph keys are `"<origin>[k].<n>"`; `k` marks inserted kashida). A connected segment (مقطع) is identified by the UTF-16 index of its first letter. When text is edited, `model/textEdit.ts` `applyTextEdit` shifts these keys; any new per-letter data must be handled there too.
- `src/store/editor.ts` holds the doc plus undo/redo (snapshots of the whole doc, limit 150). Use `commit(recipe)` for a discrete change (one undo step). For drags, call `beginGesture()`, then `gesture(recipe)` repeatedly, then `endGesture()` so the whole drag is one undo step; `liveEdit` picks whichever applies. `src/store/fonts.ts` tracks font loading; its `version` bumps when a font finishes loading so renderers recompute.
- `src/render/PageView.tsx` renders a page in `'edit'` or `'export'` mode; `io/export.ts` reuses it through `renderToStaticMarkup` to produce outline-only SVG, rasterises that to PNG/JPEG, and prints pages for PDF. Call `ensurePageFonts` before exporting so every font a page uses is loaded.
- `src/ui/Stage.tsx` is the canvas and pointer-tool logic (tools: select, glyph `G`, stretch `E`, hand, mark `M`, text); `Inspector.tsx` is the property panel.

### Fonts

- Built-in fonts are bundled locally (npm `@expo-google-fonts/*` packages or `src/assets/fonts/`); the app never fetches from a third-party server. Adding one needs **both** an entry in `BUILTIN_FONTS` in `engine/fonts.ts` (its `file` path is what tests load from disk) **and** a `?url` import plus `URLS` entry in `engine/fontLoader.ts`, and an attribution line in the README; ship its OFL licence text next to any file under `src/assets/fonts/`.
- When a built-in font is replaced, add `oldId → newId` to `RENAMED` in `engine/fonts.ts` so existing documents keep opening (e.g. `layla-thuluth` → `am-thulth`).
- `FontDef.kashida` decides whether tatweel-based kashida is applied for that style.
- User fonts (TTF/OTF only, ≤20 MB) are stored in IndexedDB with id `user-<sha256 prefix>`.

### Loading untrusted input

- Every document from a file or IndexedDB goes through `model/validate.ts`, which copies only known fields and clamps numbers. **A new field on a model type must be added to `model/defaults.ts` and `model/validate.ts`**, or it will be silently dropped on save/load. If the format changes incompatibly, bump `AUTOSAVE_KEY` in `App.tsx`.
- `io/klx.ts` parses legacy `.klx` files (VB6 PropertyBag); every read is bounds-checked against `KLX_LIMITS`. `io/klxText.ts` decodes its legacy code page and `io/klxImport.ts` maps KLX styles to the closest open font.

### Security constraints

The production server (`server.mjs`) binds to `127.0.0.1` and sends a strict CSP: `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'`, no inline scripts. Don't add CDN assets, remote fetches or inline scripts. The dev server omits the CSP (React's dev preamble needs an inline script), so verify CSP-sensitive changes with `npm run build && npm start`. `harfbuzzjs` is excluded from Vite's `optimizeDeps` because it locates its `.wasm` via `import.meta.url`.

## Tests

Tests run in Node, not a browser. `tests/helpers.ts` `loadTestFont(id)` reads font files from disk via `FontDef.file` and loads them through the same `loadFontFromBuffer` used by the app; it also contains a minimal PropertyBag writer for building `.klx` fixtures.
