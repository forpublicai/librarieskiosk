# Design

The visual + interaction design system for Libraries Kiosk. The system is encoded in [src/app/globals.css](../src/app/globals.css); this file is the *intent* that the CSS implements.

If you change the CSS in a way that contradicts this document, update this document. If you find yourself reaching for a one-off style on a page, first check whether the design system already covers it.

---

## 1. Design goals

The kiosk is **not** a consumer app. It runs on shared library hardware, in front of strangers, in a quiet public room, often as someone's first interaction with generative AI. Every design choice flows from that.

1. **Legible and quiet.** A patron should be able to use the kiosk without help. Type is large; contrast is high; nothing animates unless something is happening.
2. **Trustworthy and institutional.** The aesthetic is closer to a library catalog terminal than to a consumer chatbot — Swiss-style, restrained, no marketing copy. Patrons trust the kiosk because it doesn't try to charm them.
3. **Library-branded but unified.** All five (and growing) library deployments use the same visual language. The library identity comes from the start URL and (eventually) per-library logos, not from per-tenant theming.
4. **Friendly to short attention.** Each tool — chat, image, video, music, code — is one screen with one job. There is no nested settings or onboarding flow.
5. **Forgiving of accidents.** Sessions auto-clear after 10 minutes of inactivity. Guest mode leaves no trace. Accidental refreshes don't lose work in a single session for guests; for patrons, conversations and media are durable in the DB.
6. **Cross-environment consistent.** Light and dark themes are first-class, both fully designed. Light is the default for daytime library use; dark is supported for evening and accessibility preference.

## 2. Visual principles

### 2.1 Swiss / minimalist foundation

- Inspired by [libraries.publicai.co](https://libraries.publicai.co/).
- Neutral background, high-contrast type, single accent for action.
- No gradients except for the soft blur layers behind glass panels.
- Square corners (`border-radius: 0`) on inputs, buttons, and cards. Rounded corners are reserved for floating chips and tags.
- Generous whitespace; tight typographic rhythm.

### 2.2 Glassmorphism for floating surfaces

The login card, modal overlays, and the floating ThemeToggle use a glass treatment — semi-transparent fill, 16px backdrop-blur, faint stroke, soft shadow. This is the only place the design uses translucency. Everything else is opaque.

CSS tokens that drive it:
```
--glass-bg      semi-transparent fill
--glass-border  subtle 1px stroke
--glass-shadow  soft outer shadow
--glass-blur    backdrop-filter blur(16px)
--glass-stroke  outer focus glow on hover
```

### 2.3 Typography

- **Body:** NB International Pro (variable weights, multiple webfonts shipped under [public/fonts](../public/fonts)).
- **Mono:** NB International Pro Mono — for code blocks and the username/password input fields on the landing page (deliberately stark/terminal-y).
- All button labels and section headers use **uppercase + letter-spacing**. Body copy is sentence-case.
- Sizes: 0.75rem (label), 0.85rem (button/UI), 0.95rem (body), 1.0rem (large button), 1.5rem (page heading). No type beyond 1.5rem outside of marketing landing pages.

### 2.4 Color

Color is structural, not decorative. Two themes, defined in `:root` (light) and `[data-theme="dark"]`.

| Token | Light | Dark | Used for |
|-------|-------|------|----------|
| `--bg-primary` | `#fafafa` | `#0a0a0a` | page background |
| `--bg-secondary` | `#f0f0f0` | `#111111` | code blocks, tabs |
| `--bg-elevated` | `#ffffff` | `#161616` | focused inputs |
| `--text-primary` | `#111111` | `#f0f0f0` | body |
| `--text-secondary` | `#444444` | `#b0b0b0` | descriptions |
| `--text-muted` | `#888888` | `#666666` | timestamps, hints |
| `--accent-orange` | `#EF3C24` | inherits | hover, focus, primary CTA hover, danger |
| `--accent-green` | `#10b981` | `#34d399` | success only |

Notable: the dark theme intentionally drops `--accent-orange` from the override block (it inherits from `:root`). The orange is the *only* accent; we never use blue, purple, or mid-grays as accents.

### 2.5 Theming mechanics

- Theme is set on `<html data-theme="...">`. CSS custom properties switch automatically.
- Persisted in `localStorage['theme']`. On every page load an inline `<script>` in [src/app/layout.tsx](../src/app/layout.tsx) reads the stored value before React mounts to avoid a theme flash.
- `<ThemeToggle>` is a fixed-position floating control on every page. It is never inside a layout that scrolls.
- Defaults to **dark** (`data-theme="dark"` is hard-coded on `<html>` in `layout.tsx`). The inline script flips it to light if the user previously chose light.

## 3. Components

The repo intentionally has only three shared React components: `AuthProvider`, `ThemeToggle`, `Header`. Everything else is in-page. The shared *style* primitives instead live in `globals.css` as CSS classes:

| Class | Purpose |
|-------|---------|
| `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-lg` | Buttons. Default is outlined; `-primary` is filled. Hover always swaps to orange with a soft glass glow + 3px lift. |
| `.input`, `.form-group`, `.form-label` | Form controls. Square corners, border-strong stroke, glass blur, orange focus border, light elevated background on focus. |
| Login surface | `.landing-*`, `.login-*` classes for the auth screens. Login is a floating glass card on the right of a hero/nav layout. |
| Generation surface | Each mode page composes generic input + result containers; no shared component yet. Patterns are duplicated across [src/app/chat/page.tsx](../src/app/chat/page.tsx), [src/app/image/page.tsx](../src/app/image/page.tsx), etc. |
| Spinner | `.gen-spinner` for in-flight generations. |

**Hover policy:** any interactive element gets a single coherent hover treatment — orange background, white text, transparent border, soft glass glow box-shadow, and `translateY(-3px)`. We don't do per-component hovers.

**Focus policy:** keyboard focus is the same as hover (or a tightened variant). Never `outline: none` without a replacement.

**Disabled state:** `opacity: 0.3; cursor: not-allowed;`. No greyed-out colors; the design relies on opacity alone so disabled buttons look like the same button, faded.

## 4. Layout patterns

- **Landing/login** — two-column hero on desktop: left is brand + nav + "learn more"; right is a floating glass login card. On narrow screens these stack.
- **Dashboard** — grid of large mode tiles. Each tile spans 4 or 6 columns out of 12, with chat/code/music as small tiles and image/video as wide tiles.
- **Mode pages (chat, code, image, video, music)** — split layout: prompt input on the left, output/history on the right. Long-running generations show a progress affordance via [`useGenerationProgress`](../src/hooks/useGenerationProgress.ts).
- **Admin pages** — tab strip at top, table or list below. Admins see their library's pool, patrons, and pending credit requests. Super-admins see cross-library tabs (overview, libraries, users, guests).

## 5. Iconography and imagery

- The only logo asset shipped is [public/images/lib-logo.png](../public/images/lib-logo.png) (Public AI Libraries Project mark) plus `logo.svg`.
- No icon library. Buttons that need a glyph use a plain emoji (`👤` on Continue as Guest) or text — a deliberate choice to keep the bundle small and the visual style flat.
- Generated images are displayed at native aspect ratio with a thin border. No drop shadows on user content.

## 6. Motion

- Transitions are limited to `all 0.2s ease` on hover/focus state changes for buttons and inputs. No keyframe animations except the spinner.
- Page transitions are unanimated — App Router defaults.
- The 3px lift on button hover is the closest the design comes to playful motion.

## 7. Accessibility

- Type sizes default to 0.85–1.0rem; line-height 1.5. No body copy below 0.75rem.
- Light and dark themes both meet WCAG AA contrast for body text on background.
- Inputs always have explicit `<label>` tags; the design relies on persistent labels, not placeholder-only inputs.
- Idle timeout is 10 minutes — long enough that someone reading slowly does not get logged out, short enough that the next patron doesn't see the previous patron's state.
- All interactive elements are keyboard-reachable (no `tabindex="-1"` shortcuts). Buttons are `<button>`, links are `<a>`.

## 8. Content tone

- Headlines are uppercase, terse: "SIGN IN", "CONTINUE AS GUEST", "WAITING FOR APPROVAL".
- Body copy is plain English, no marketing language. "Generate stunning images with advanced AI models" is the *most* florid line in the app and is on the dashboard tile.
- Errors are stated, not apologized for: "Library at capacity, try again later or contact library admin." not "Oops! It looks like…"
- Status copy explains the *state* and the *next action*: "Your account is waiting for approval from the **Pottsboro, TX** library administrator."

## 9. What the design is *not*

- **Not branded per-library.** A Pottsboro patron and a Salem patron see the same UI. (The kiosk's start URL determines which library's pool they spend from, but the chrome is identical.) If branding becomes a requirement, add it as a *per-library theme* layer; do not fork the design system.
- **Not gamified.** No streaks, badges, social proof, or progress meters beyond actual generation progress.
- **Not chatbot-y.** Avatars, typing indicators, and conversational micro-copy ("I'd love to help…") are out of scope. The model speaks; we render its output.
- **Not adaptive.** No personalization, recommended models, or "try this prompt" suggestions. The kiosk shows the same dashboard to everyone.

## 10. Deciding where new visuals go

| Change | Where it goes |
|--------|--------------|
| New shared button variant | `globals.css` as `.btn-<variant>`, plus a one-line note in this file. |
| One-off page-specific style | Inline style or a `<style jsx>` block on the page; do not add to `globals.css`. |
| New theme color or token | `:root` and `[data-theme="dark"]` blocks; document the token in §2.4 of this file. |
| Per-library skin | Open a milestone plan first — the design has not yet absorbed per-library theming and layering it in later is non-trivial. |
| New shared component | Justify by use in **two or more** pages. One-off → keep it inline in the page. |
