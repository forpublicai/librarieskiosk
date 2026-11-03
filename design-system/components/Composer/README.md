# Composer

The message box at the bottom of every chat screen, with the send button inside it.

## Props
- `placeholder`: an inviting example ("Ask anything…", "Describe the picture you want…").
- `value` + `onChange` to control it, or `defaultValue` to let it manage itself.
- `onSend(text)`: called on Enter or the send button with the trimmed text. The box then clears.
- `busy`: the AI is working. The send button becomes Stop, and Enter does nothing.
- `onStop`: called by the Stop button.
- `hint`: the line under the box. Pass `false` to hide it. Default: "Press Enter to send. Shift + Enter for a new line."
- `label`: screen-reader label, default "Message".

## Do and do not
- Dock it at the bottom of the thread column, `content-max` wide.
- The box grows up to six lines, then scrolls.
- Show the credit cost in the hint for paid tools ("Uses 1 credit per image").
