# ChatMessage

One turn in a conversation: the patron's message in a `cobalt` bubble on the right, or the AI's reply as plain text on the left.

## Props
- `role`: `user` or `assistant`.
- `children`: the message. Assistant replies may hold paragraphs, lists, `pre`/`code` blocks and images; they are styled for you.
- `actions`: quiet `Button`s under an assistant reply (Copy, Download).
- `time`: an optional timestamp in `small`.
- `thinking`: `true` or a string. Renders the spinner and "Thinking…" in place of a reply.

## Do and do not
- Do keep the thread at `content-max` (760px) wide and `space-5` between messages.
- Do not add avatars, names or typing dots. The layout already shows who spoke.
- Show generated images full column width with `radius-lg`. Links in replies are `cobalt` and underlined.
