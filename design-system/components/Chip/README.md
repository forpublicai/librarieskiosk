# Chip

A rounded, tappable pill for example prompts and simple option choices.

## When to use
- Example prompts above an empty composer. Remove them once the chat starts.
- A small set of options, such as image shape (Square, Wide, Tall). Pass `selected` to make it a toggle. A selected chip is filled `ink` with `surface` text.

## Props
- `children`: the text.
- `icon`: an optional `Icon` name.
- `selected`: `true` or `false` turns the chip into a toggle with `aria-pressed`. Leave it out for plain actions.
- `onClick`.
