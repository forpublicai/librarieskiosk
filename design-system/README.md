The kiosk is a shared computer in a public library. The person at it may be eight or eighty, may never have used AI, or may build software for a living. Every screen must work for all of them on the first try, without help from staff.

The look is **civic and playful**: the bold, plain clarity of good public signage, with the color and shape of a children's library. Public AI red leads. Cobalt, sunflower, pink and leaf green give each tool its own color, so a patron can say "the yellow one" and find Image again. Solid color, big type, real shapes, and buttons with a soft modern finish. Nothing floats or blurs. Only the sign-in page has a faint glow.

## Principles

1. **Familiar first.** Use layouts people already know from messaging and email apps: a thread with a box at the bottom, the send button inside it, past chats on the left, Home in the top corner. Do not invent new gestures.
2. **Color means something.** Each tool has one color and one shape, used everywhere that tool appears. Red is for the main action. Cobalt is for links and focus. Color is never decoration with no job.
3. **Say it in words.** Every button has a text label. Only send, stop, close and menu are icon-only, and they carry an `aria-label`.
4. **Big and high-contrast.** Running text is `body` (18px) or larger. Chat is `body-lg` (20px). Every text pair meets WCAG AA in both themes. Tap targets are at least `target-min` (48px).
5. **Calm and fast.** No glass, neon glows, hard-edged blobs or looping motion. Fills are solid. Buttons get one soft sheen and a 1px lift, so they look pressable, and nothing else does. This renders fast on modest kiosk hardware.
6. **Forgiving.** Destructive actions ask once. Errors say what happened and what to do next.

## What we never do

These patterns make an interface look machine-made and generic. Check every screen against this list.

- **No loud gradients or glowing buttons.** A filled button is one hue. It may carry one soft sheen of that hue (a lighter top edge, a slightly deeper base) and a 1px lift. Never two hues, never a glow.
- **No emoji as icons.** Use the `Icon` set.
- **No heavy or stacked shadows.** Tiles have none. Buttons have only a 1px lift. Only the composer, menus (`shadow-sm`) and dialogs (`shadow-lg`) lift more.
- **No glassmorphism, no decorative gradients, no floating animations.** Backgrounds and tiles are solid color. The one exception is the faint red glow on the sign-in page (see Layout).
- **No neon glow on dark.** Dark mode uses the same fills, lighter.
- **No purple, indigo or muted amber.** The palette is red, cobalt, sun, pink and green on navy-ink neutrals.
- **No colored side borders.** Selected rows use a full tint; notices are a neutral box. Never a stripe on one edge.
- **No color-coded boxes.** Status color lives on the icon and the title only, never as a background.
- **No cards around everything.** Lists are rows with hairlines. Settings are rows. Only tool tiles and dialogs are boxes.
- **No red wavy underlines.** They read as a spelling error. Mark a key word with the sun `Highlight`.
- **No same-radius-on-everything.** Controls are `radius-md`, tiles `radius-lg`, chips and the send button round, shape art its own geometry.
- **No equal-weight buttons in a row.** One `primary` per view; the rest are `secondary` or `quiet`.
- **No default chart colors.** Charts use the tool colors in a fixed order: `red`, `cobalt`, `sun`, `pink`, `green`.
- **No wordy filler or fake stats.** One short sentence beats three.

## Content fundamentals

Write like a helpful librarian: plain, warm, short. Speak to the patron as "you". The kiosk does not say "I"; the AI's replies may.

- **Sentence case everywhere.** "Start a new chat", not "START A NEW CHAT".
- **Verbs on buttons.** "Make image", "Send", "Ask for more credits". Never "Submit" or "OK".
- **Plain words.** "Picture", not "generation". "Credits", not "tokens". Tools are Chat, Image, Music, Video, Code.
- **Errors say what and what next.** "You are out of credits. They renew Monday at midnight, or you can ask the library for more." No "Oops!".
- **No emoji in the interface.**

| Before | After |
| --- | --- |
| EXPLORE SERVICES | What would you like to do today? |
| Generate stunning images with advanced AI models. | Describe a picture. The AI draws it. |
| Start a conversation with AI | Ask a question, get help writing, or plan something. |
| Library at capacity, try again later or contact library admin. | All kiosks here are in use. Please try again in a few minutes, or ask a librarian. |

## Color

**Neutrals** carry the page. Set the page and thread on `surface`, the sidebar and code on `surface-sunken`. Text is `ink`; secondary text `ink-muted`; timestamps and placeholders `ink-subtle`. Rows are split by `border` hairlines. Control edges use `border-strong`. The neutrals lean cool navy, never beige.

**Red** is the brand and the action.
- `red` (`#ef3c24`) at full strength: the logo, big color blocks, shape art, the Chat tool.
- `red-strong`: primary buttons, the send button, the Chat hero tile, with `on-red` text. Use one red action per view.
- `red-soft`: the selected history row, with `ink` text.

**Tool colors.** Each tool owns one hue, used for its tile, its header shape and any chart. In Light a tile is the tool's tint with the shape in full color; in Dark the tile is the full color with `on-` text and the shape cut out in `surface`.

| Tool | Color | Tint | Shape |
| --- | --- | --- | --- |
| Chat | `red` / `red-strong` | `red-soft` | speech bubble |
| Image | `sun` | `sun-soft` | sun over a hill |
| Music | `pink` | `pink-soft` | sound rings |
| Video | `cobalt` | `cobalt-soft` | rounded play triangle |
| Code | `green` | `green-soft` | the logo chevron |

**Cobalt** also means "you can follow this": links and the focus ring. The patron's own chat bubble is `cobalt` with `on-cobalt` text, as in familiar messaging apps.

**Rules for bright fills.** `sun` and `pink` are light: put `on-sun` / `on-pink` (ink) text on them, never white, and never use them as text. `red-strong`, `cobalt` and `green` take white text in Light and ink text in Dark (`on-red`, `on-cobalt`, `on-green`).

**Status** always shows an icon and a word as well as a color: `success` (green, check), `warning` (amber, alert), `danger` (deep red, alert). The color goes on the icon and the title only. The box stays neutral (`surface-raised`, `border`), and the body text stays `ink`.

**Credits** show as a neutral pill with one `sun` coin. When credits run low, the coin becomes a `danger` alert icon and the number turns `danger`. The pill never fills with color.

## Typography

One family: **Lato**, from Google Fonts. In the app, load it with `next/font/google` (weights 400, 700, 900 and italic 400) and set it as `--font-sans`. Code uses the system monospace.

- `display` (48px Black): one per screen, the Home greeting and the empty chat.
- `title` (30px Black): page and dialog titles.
- `heading` (22px Bold): tool names and section titles.
- `body-lg` (20px): chat messages and the composer.
- `body` (18px): all other running text. The floor for anything a patron must read.
- `label` (18px Bold): buttons, labels, chips.
- `small` (15px): timestamps and fine print only.

Lato has no medium weight: hierarchy steps from Regular to Bold to Black. Do not fake weights. Keep lines under about 70 characters: the chat column stops at `content-max`. No letter-spacing on labels and no all-caps.

## Shape

The kiosk has real shapes, not soft blobs. They come from three sources: the logo's square and chevron, library architecture (arches, book spines), and the five tool shapes in the table above.

- Shapes are solid fills in a tool color, drawn as SVG from circles, arches, quarter-circles and rounded polygons.
- Shapes sit in the corner of a tile, fully inside it, with clear space from the edge (`space-3` on small tiles). They never sit behind text.
- Use one shape per tile. Never scatter shapes as background confetti.
- Shapes stay still until a patron points at their tile. Then they tip up a little (4px and 6°) and settle back.

## Layout

- **Header** (64px, `surface-raised`, bottom `border`): the logo always comes first, in the same place on every screen. On tool screens a Home button follows it. On the right: the tool's shape and name, then any tool actions, credits, account, theme and sign out, each with a label. Below 820px the Home button hides, and the logo still leads Home.
- **Sign-in**: the brand side (logo, one short line, help links) sits on `surface` with a faint glow: a red radial wash at 8% behind the logo and a green wash at 6% to the upper right. The brand side (up to 560px) and the form card (up to 460px, `surface-raised`, `border`, `radius-lg`) sit side by side in one centered row, `space-8` apart, so a wide screen has no empty middle. Below 900px they stack. There is no display headline. "Sign in" is the page's only `h1`.
- **Home**: one `display` greeting that names a signed-in patron ("Hi Sam, what would you like to do today?"), with no line under it and no `Highlight`. Guests see the same question with no name. The tool tiles follow, `space-6` below. Chat is the wide red hero tile. Image, Music, Video and Code follow as tinted tiles, each with its shape. On narrow screens, one tile per row.
- **Tool screens**: a `sidebar-width` history panel on `surface-sunken`, the thread centered at `content-max`, the composer docked at the bottom. Below 900px the sidebar becomes a drawer behind a "Conversations" button.
- **Spacing** uses the `space-*` steps only, the same way every time: rows pad `space-3` `space-4`, tiles pad `space-5`, sections sit `space-6` apart.

## Chat

- The patron's messages sit on the right in a `cobalt` bubble with `on-cobalt` text, `radius-lg`, max 80% wide.
- The AI's replies sit on the left with no bubble, full column width, `body-lg` `ink`. Under each reply: Copy and, for media, Download, as quiet buttons.
- No avatars. While the AI works, show "Thinking…" with the spinner, and turn send into Stop.
- Example prompts are chips above an empty composer, never once a chat has started.
- The composer is one box (`radius-xl`, 2px `border-strong`, `shadow-sm`) that grows to six lines. Enter sends. Shift + Enter makes a new line. A `small` hint says so, and shows the credit cost on paid tools.

## States and motion

- **Hover**: quiet controls fill with `surface-hover`; filled buttons darken one step. **Pressed**: the lift goes away and the fill darkens again, so the button looks pushed in. Tiles show a 2px `ink` outline, and their shape tips up.
- **Focus**: a solid 3px `focus` (cobalt) ring, 2px outside the control, on `:focus-visible`. Never remove it.
- **Selected**: `red-soft` fill and Bold `ink` text. No edge stripe.
- **Disabled**: 45% opacity, `cursor: not-allowed`, and a reason nearby when it is not obvious.
- **Loading**: the spinner plus words ("Making your image…").
- **Motion**: motion answers the patron. It never runs on its own in a loop.
  - Color changes: 120ms ease-out.
  - Tool shapes tip up on hover and focus (240ms, a small spring).
  - The spinner is the only looping animation.
  - Animate only `transform`, `opacity` and color, so motion stays smooth on kiosk hardware.
  - With `prefers-reduced-motion`, all of this stops, and the spinner slows down.
  - Nothing moves for more than 5 seconds unless the patron moves it (WCAG 2.2.2).

## Iconography

The `Icon` component holds the kiosk's own line icons: 24px grid, 2px stroke, round caps, `currentColor`. They are drawn for this system. Pair every icon with a word. Do not mix in other icon sets, and do not use emoji.

## Logos

Use the Public AI logo from the Logos group. In Light, use `lib-logo.png` (all red). The `logo.svg` lockup has white letters: use it only in Dark or on a `red` block. Keep clear space around the mark equal to half the height of the red square. Do not recolor, stretch or add effects.

## Accessibility checklist

- Text pairs meet 4.5:1 in both themes; each token's note names its grounds.
- Targets are at least 48 × 48px with at least `space-2` between them.
- Every input has a visible label. Placeholders are examples only.
- Status uses icon + word + color, never color alone. Tool colors always come with the tool's name.
- Everything works by keyboard, and the focus ring always shows.
- Respect `prefers-reduced-motion` and `prefers-color-scheme` on the first visit.
- The page zooms to 200% with no loss and no sideways scroll.
