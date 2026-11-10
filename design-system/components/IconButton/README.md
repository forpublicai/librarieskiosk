# IconButton

A round button that shows only an icon, for the few actions everyone already knows: send, stop, close and menu.

## Props
- `icon`: the `Icon` name.
- `label`: REQUIRED. Read by screen readers and shown as a tooltip.
- `variant`: `quiet` (default) or `primary` (the send and stop buttons).
- `size`: `md` (48px) or `lg` (56px).

## Do and do not
- Use an `IconButton` only for send, stop, close and menu. Every other action is a `Button` with a word.
- Do not place two icon buttons closer than `space-2`.
