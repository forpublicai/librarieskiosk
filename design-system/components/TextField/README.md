# TextField

A labelled text input with optional help or error text below it.

## Props
- `label`: REQUIRED, always visible above the field.
- `hint`: short help in `ink-muted`.
- `error`: replaces the hint; shown in `danger` with an alert icon, and marks the field invalid.
- `multiline`: render a `<textarea>` (prompts for image, music and video).
- Other props go to the native `<input>` or `<textarea>`.

## Do and do not
- Do keep the label visible. Placeholders are examples ("For example: a red barn in snow"), never the label.
- Do write errors that say what to do next.
- Do not set the input text smaller than `body` (18px).
