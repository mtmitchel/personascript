# Design System: PersonaScript

**Project ID:** Not applicable — this is a local React application, not a Stitch project. See [Source and scope](#source-and-scope).

## 1. Visual Theme & Atmosphere

**Editorial instrument — monochrome, quiet, document-first.**

The interface behaves like a piece of writing equipment rather than a product dashboard. Its near-pure grayscale palette exists so that the draft fills the screen and nothing in the chrome competes with it. Color appears only to report a condition; it is never decorative, never used for emphasis, and never used for branding.

The mood is **disciplined, unhurried, and precise**. Density is high but the type is small and evenly weighted, so the interface reads as a tool rather than a wall of text. Contrast carries the hierarchy instead of size: most surfaces sit between `#FAFAFA` and `#E5E5E5`, and the darker the element, the more it matters. A near-black `#171717` is the strongest signal available and is spent sparingly, on primary actions and on the single most important line in a unit.

Notably, the primary action color is **black, not a brand hue**. There is no accent color in the system at all. The result is sober, non-promotional, and slightly institutional — closer to a good code editor or a print layout tool than to a consumer app.

Elevation is nearly absent. Depth is implied by hairline borders and background tints rather than shadows, which keeps 100-plus-item lists calm and flat. Corners are gently curved, never sharp and never fully rounded except on small status pills.

## 2. Color Palette & Roles

### Structural surfaces and text — the entire visual system

| Descriptive name | Hex | Functional role |
|---|---|---|
| Paper White | `#FFFFFF` | Cards, panels, input fields, the control surface of segmented options |
| Page Mist | `#FAFAFA` | Application background; also the tint for inset/quiet regions |
| Panel Tint | `#F5F5F5` | Secondary fills: action bars, hover states, selected-but-unemphasized values |
| Hairline | `#E5E5E5` | The dominant separator — borders, list rules, section dividers |
| Control Border | `#D4D4D4` | Input strokes, button outlines, the frame around segmented controls |
| Faint Marker | `#A1A1A1` | The `·` separators in metadata runs, disabled glyphs |
| Muted Ink | `#737373` | Constraint text, helper copy, inactive tab labels |
| Secondary Ink | `#525252` | Supporting prose, section micro-labels |
| Body Ink | `#404040` | Dense body copy inside secondary panels |
| Strong Ink | `#262626` | Titles and values on tinted backgrounds |
| Primary Ink | `#171717` | Headings, primary button fill, selected state in segmented controls |
| Deep Ink | `#0A0A0A` | Reserved; only where maximum contrast is required |

The neutral ramp is **perfectly achromatic** — zero chroma at every step. That is deliberate: it guarantees that the draftsman's own content, and the three status colors below, are the only saturated things in the product.

### Status colors — the only saturated hues

| Descriptive name | Hex | Functional role |
|---|---|---|
| Signal Amber (fill) | `#FFFBEB` | Warning background |
| Signal Amber (edge) | `#FEE685` | Warning border |
| Signal Amber (deep) | `#7B3306` | Warning text — the "this needs you" notice |
| Signal Rose (fill) | `#FFF1F2` | Error and destructive background |
| Signal Rose (edge) | `#FFCCD3` | Error border |
| Signal Rose (ink) | `#EC003F` | Destructive action text, error emphasis |
| Signal Rose (deep) | `#A50036` | Error body text on tinted ground |
| Signal Emerald (fill) | `#ECFDF5` | Success background |
| Signal Emerald (edge) | `#A4F4CF` | Success border |
| Signal Emerald (ink) | `#009966` | Success text and confirmations |

Role discipline: **amber = attention required**, **rose = destructive or failed**, **emerald = verified or complete**. No other hue appears anywhere in the product.

### Named ambiguity worth resolving

Rose is currently doing double duty: it marks both a *failed* state and a *conflicting-source* state, which is closer to "attention required" than to "error". The distinction between amber and rose is therefore not fully principled. Pick one owner per condition before extending the palette.

## 3. Typography Rules

**Primary family — Plus Jakarta Sans** (`system-ui` fallback). A geometric sans with a tall x-height and open apertures, applied to *everything* in the interface: headings, buttons, labels, body copy, metadata.

**Technical family — JetBrains Mono.** Used only where the content is machine-produced and needs no reading rhythm: file extensions, word-count deltas in diffs, character counters, identifier strings.

**Instrument Serif is declared in the theme and never applied.** It exists in the font stack but no element uses it. Treat it as a latent editorial voice; either commit to it for long-form headings or remove it.

**No display face.** There is no typographic flourish anywhere. Voice is carried entirely by the author's own prose, never by the chrome.

### Scale in practice

The working range is tightly compressed at the small end, which is what produces the "instrument" feel:

- **11px, 700 weight, uppercase, +0.04em tracking** — section micro-labels. The only letter-spaced text in the system. Used as tiny structural signposts, never as content.
- **12px, 400 weight** — the workhorse. Metadata, constraints, helper copy, table cells, chip text. This is the single most-used size in the codebase.
- **13px, 500 weight** — supporting prose and inline actions.
- **14px, 600 weight** — the *unit title*. The lead line of a card or row, and the element a reader must see first.
- **15–17px, 600 weight, −0.2px tracking** — panel headings.
- **22px, 600 weight, −0.4px tracking** — page titles.
- **16px at 1.85 line height** — the reading surface. Long-form prose alone gets this generous setting, capped at a 72-character measure.

Weight is the primary hierarchy tool: `400` for guidance, `500` for actions, `600` for the thing that must be read first, `700` only for uppercase micro-labels. Negative tracking is applied as size increases and is never used on body copy.

## 4. Component Stylings

**Buttons.** Three ranks. *Primary* is a solid near-black (`#171717`) fill with white text and an 8px radius, lightening one step on hover — one per screen, never repeated. *Secondary* is white with a `#D4D4D4` hairline and a `#F5F5F5` hover wash. *Inline text actions* are unadorned `#525252` text that underlines on hover; these carry most in-context actions and are deliberately weightless so they never compete with content. Minimum touch height is 40px on primary and secondary, 30–36px on inline actions.

**Segmented controls.** A single hairline-bordered container with 8px outer radius holding evenly divided segments. The **selected state is a quiet neutral fill with a heavier weight** — outlined, not filled. Reserve a strong fill (dark surface, white text) for controls with only two or three options at large size. Repeated per-row selection controls — the treatment choice on rewrite-plan rows — use the quiet selected state (`#F5F5F5` tinted fill, `#171717` border, weight 600); a dark fill there would multiply into a field of heavy blocks down a long list.

**Status pills.** Truncated to `rounded-full`, 11px, weight 600, padding 2px 8px, tinted background with matched deep text. Roles are color-coded (amber attention, rose conflict, emerald verified). Neutral pills (`#F5F5F5` ground, `#525252` text) carry recorded state such as the Keep / Shorten / Cut treatment on plan rows. They must stay small and light — they are annotations, not buttons.

**Cards and containers.** White or near-white ground, `#E5E5E5` hairline border, 8px radius for in-panel objects and 12px for the top-level pane containers. **No shadow.** Panels are delineated by their border and a slightly lighter page background behind them.

**Inputs and forms.** White ground, `#D4D4D4` border, 6px radius, 12px padding, 14px text at 1.7 line height. Focus is a 2px `#171717` outline at a 2–3px offset — visible, rectangular, and unmissable, applied uniformly across every interactive element including non-inputs. Text areas grow to fit their content rather than scrolling internally; a field that hides its own value behind a scrollbar is treated as a defect.

**Inline notices.** Full-width tinted bands with a 1px matched border and an 8px radius. Three variants only: neutral (informational), amber (warning), rose (error). No toast or transient notification pattern exists.

**Elevation.** Two shadows in the entire system: a whisper-soft `0 4px 16px rgb(0 0 0 / 7%)` on floating dropdowns, and a `0 1px 3px rgb(0 0 0 / 6%)` on the selected tab in a view switcher. A third, `inset 0 0 0 1px #A1A1A1`, is used as a pressed-state ring. Everything else is flat.

**Motion.** No transitions are defined anywhere. State changes are instant; the only animation in the product is a spinner glyph during long operations. Reduced-motion is honored by disabling that spinner.

## 5. Layout Principles

**Container.** Content is capped at 1600px and centered, with 24px gutters.

**The split-pane workspace is the signature layout.** The document occupies the flexible left column; a fixed-width control rail occupies the right. The rail is elastic by design — `clamp(460px, 40vw, 560px)` — because it must hold prose, controls, and quotations without forcing them to wrap into ambiguity. Below 1150px the rail narrows to 360px and the document contracts. Below 960px, or under 600px of height, the panes stack vertically and each scrolls independently.

**Whitespace strategy.** Vertical rhythm comes from a 20–24px step between blocks and a 4–8px step within them. Section separation prefers a hairline rule over a gap, and prefers a gap over a container. Nesting containers inside containers is avoided — it multiplies borders and makes depth ambiguous.

**Prose measure is a hard constraint.** Reading surfaces are capped at **72 characters**; dense helper prose is capped at **46 characters**. A side rail is never allowed to run body copy to its full width.

**Alignment.** Mixed baseline runs (a count, a label, and a status) sit on a single text baseline, separated by a `·` glyph in `#A1A1A1` rather than by bullets or pipes. This pattern repeats throughout metadata.

**Scroll containment.** Each pane owns its own scrolling region with `overscroll-behavior: contain`, so the page itself never scrolls in the workspace. Controls that govern a scrolling region's content stay pinned within that region, so they cannot be scrolled out of reach.

## Source and scope

Taken from the repository rather than a Stitch project, so there is no Project ID and no Stitch MCP retrieval was used. Every value above was read from the code:

- Palette and type tokens: `src/index.css` (Tailwind v4 `@theme` block), plus the default Tailwind scales referenced there as `var(--color-*)`
- Hex values: converted from the OKLCH definitions in `node_modules/tailwindcss/theme.css` and verified against Tailwind's published palette
- Typeface loading: `index.html`
- Component and radius conventions: the `src/components/` stylesheet and class usage

**Constraints to be aware of when using this as a Stitch prompt.**

1. Fonts load from Google Fonts, so type will fall back to system sans without network access.
2. There is no dark mode. `prefers-color-scheme` is not handled.
3. No spacing, radius, or shadow tokens are customized; the system uses Tailwind v4 defaults.
4. No component library. All styling is utility classes plus one hand-written stylesheet.

**One resolved question.** Selected states in repeated controls were once drawn as heavy dark fills, which turned a long list into a column of near-black blocks. The rewrite-plan rebuild resolved it: repeated selection controls use a tinted fill at `#F5F5F5` with a `#171717` border and weight 600, and the dark fill stays reserved for the one primary action per screen.
