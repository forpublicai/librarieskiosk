# Notice

A neutral box that tells the patron about a state and what to do next. Only the icon and the title carry the status color.

## Props
- `tone`: `info | success | warning | danger`, default `info`. Sets the icon and the color of the icon and title (`cobalt`, `success`, `warning`, `danger`). The box is always `surface-raised` with a `border` hairline. No tinted background and no edge stripe.
- `title`: one short sentence that names the state.
- `children`: one or two sentences with the next step.
- `action`: an optional `Button` at the end.

## Do and do not
- Do state what happened, then what to do. Do not apologize or blame.
- Do keep the body text `ink`. Do not color the whole message.
- Do not show more than one notice at a time in the same area.
- `danger` notices are announced at once to screen readers (`role="alert"`). Others are polite.
