# Button

The labelled button for every action on the kiosk, in four variants.

## When to use
- `primary`: a solid `red-strong` fill, the one main action of a view ("Make image", "Sign in"). Use one per view.
- `secondary`: other real actions ("Start a new chat", "Sign out").
- `quiet`: low-weight actions in rows and toolbars ("Copy", "Download", header items).
- `danger`: actions that delete or cannot be undone. Always confirm first.

## Props
- `variant`: `primary | secondary | quiet | danger`, default `secondary`.
- `primary` has a soft sheen of its own red (a lighter top edge, a slightly deeper base) and a 1px lift. `secondary` and `danger` have a 1px `border-strong` (or `danger`) edge, a faint sheen and a softer lift. `quiet` is flat until hover.
- When pressed, the lift goes away and the fill darkens. No variant glows or uses two hues.
- `size`: `md` (48px, `target-min`) or `lg` (56px, `target-lg`) for the main call to action on a screen.
- `icon`, `iconEnd`: an `Icon` name shown before or after the label.
- `block`: fill the width of the container (forms, narrow screens).
- `children`: the label. A verb in sentence case.
- Any other prop goes to the native `<button>` (`onClick`, `disabled`, `type`).

## Do and do not
- Do write a verb: "Send", "Make image". Do not write "Submit" or "OK".
- Do not set labels in all caps.
- When a button is disabled, show why nearby.
