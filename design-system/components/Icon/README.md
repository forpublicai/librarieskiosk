# Icon

Line icons for the kiosk: 24px grid, 2px stroke, round caps, drawn in `currentColor`.

## When to use
Put an icon beside a text label to help new readers and children find an action fast. The icon never replaces the word, except in an `IconButton`, which carries an `aria-label`.

## Props
- `name`: one of `chat image music video code send stop plus back home user credits sun moon signout copy download help check alert menu close`. `Icon.names` lists them.
- `size`: pixels, default 24 (`icon-md`). Use 20 inside chips and small rows, 28 to 32 in mode cards.
- `label`: give it only when the icon stands alone and means something. Otherwise it is hidden from screen readers.

## Do and do not
- Do set the color through the parent's `color` (`ink`, `ink-muted`, `cobalt`, a status color).
- Do not use emoji in place of these icons.
- Do not mix in icons from another set with a different stroke.
