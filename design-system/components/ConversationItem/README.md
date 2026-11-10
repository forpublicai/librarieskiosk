# ConversationItem

One row in the history sidebar: a past conversation or creation the patron can reopen.

## Props
- `title`: the first line of the conversation, cut with an ellipsis.
- `meta`: a short date ("Today", "Yesterday", "Oct 28").
- `icon`: optional, the tool's icon.
- `selected`: the open conversation. Shows a full `red-soft` fill and Bold text, and sets `aria-current`. No edge stripe.
- `onClick`.

## Do and do not
- Place rows on `surface-sunken` with `space-1` between them.
- Group rows by date with a `small` heading in `ink-subtle` ("Today", "Earlier").
