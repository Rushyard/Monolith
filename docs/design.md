# Monolith — design direction (p2-frontend)

The home page is the reference: a Kubrick dawn, one black 1:4:9 slab, a sunrise. The three inner pages must feel like
the film continues inside, not like an admin panel bolted onto a trailer. Today they are small grey boxes with tracked
capitals everywhere: that is what we replace.

## Concept: three sets of the same film

| Page | Set | The one bold element (spend boldness only here) |
|---|---|---|
| `/vault` | Inside the monolith | The confidential balance lives in a single black 1:4:9 slab, edge-lit. Only the owner's browser lights it. |
| `/auditor` | HAL's console | HAL's eye (exists). The ledger is a calm two-column record: what everyone sees, what the key reveals. |
| `/agent` | Mission control | The conversation is primary. The budget slab (exists, 1:4:9, lit from below) is the bold element. |

Everything around the bold element stays quiet and disciplined.

## Tokens (keep the existing `:root` variables; do not rename them)

- Color: `--void #000` background (true black, never #0b0b0b), `--fg #e9e6df` text, `--muted #8b877e`, `--faint #55534d`,
  `--sun #fff4dc` = revealed / approved / success, `--hal #ff2a17` = refused / danger, `--hidden #b7a6ff` = encrypted state only.
  No new accent colors. No gradient washes as decoration.
- Type:
  - `--console` (Michroma) — the chapter title (h1) only. `clamp(28px, 4.2vw, 52px)`, letter-spacing .18em.
  - `--font` (Jost) — everything people read. Body 17px / 1.6, weight 300–400. Section titles Jost 500, 20–22px, **sentence case**.
  - `--mono` (IBM Plex Mono) — only for data that is literally code: addresses, hashes, amounts, ledger numbers.
- Tracked ALL-CAPS: at most one small element per page (the chapter marker). Labels, buttons and section titles are sentence case.
- No "→" appended to buttons/links, no "A · B · C" meta strings, no eyebrow label above every heading.
- Radius: 0 for slabs and the main object; 2px for inputs and buttons. No soft grey drop shadows.
- Spacing: 8px base; sections separated by 64–96px on desktop. Max content width 1120px. Line length < 72ch.

## Layout

Inner pages, desktop ≥ 960px:

```
| chapter title + one-sentence lede (left, 7 cols)            |                         |
|-------------------------------------------------------------|  the bold object        |
| the actions, as a vertical sequence when they ARE a sequence|  (5 cols, sticky)       |
| (connect → deposit → merge → send → withdraw)               |                         |
| quiet history / log at the bottom                           |                         |
```

Mobile: single column, the bold object first, 16px gutter, no horizontal scroll.
Left-aligned text everywhere except the home hero.

## Header

- Home: hidden on load (the film is full-bleed). It fades in once the hero has been scrolled past, or when the pointer
  comes within ~64px of the top. Keyboard focus on any header link must reveal it.
- Inner pages: visible, transparent over black, no gradient band, thin and quiet. Wordmark left; Vault / Agent / Auditor
  and the language switch right; current page marked by colour + a 1px underline, not by caps.

## Motion

One orchestrated moment per page at most (e.g. the vault slab lighting up when the balance is revealed). Motion that
answers an action is welcome (a step completing). No fade-and-slide-up on every section, no hover effects on every card.
Respect `prefers-reduced-motion`.

## Copy

Plain verbs, sentence case, active voice. A button says what happens ("Sign the payroll", "Deposit 10 USDC").
Errors say what happened and how to fix it. Keep every existing i18n key; new strings go in a block at the END of
`app/lib/i18n/en.ts`, `fr.ts`, `pt.ts` (before the closing brace), named `// --- <page> design (p2) ---`, in all 3 languages.

## Hard rules

- Visual and markup only. Never change handlers, state, fetch calls, wallet / prover / Freighter code, API routes,
  `next.config.ts` (COOP/COEP), the agent lib, or what is sent on-chain.
- Never claim anything the app does not do (amounts hidden on-chain ≠ anonymous; addresses stay public).
- Quality floor: responsive to 375px, visible keyboard focus, reduced motion, WCAG AA contrast.
- `npm run build` must pass.
