# ChatScreen

A full chat screen built only from system parts, to show how they fit together. It is a showcase page, not a component to import.

- `AppHeader` with a Home button and the tool title.
- A `sidebar-width` history panel on `surface-sunken`: a secondary "Start a new chat" button, date group labels in `small` `ink-subtle`, then `ConversationItem` rows.
- The thread on `surface`, centered at `content-max`, `space-5` between `ChatMessage`s.
- The `Composer` docked at the bottom of the thread column.

Type a message in the preview and press Enter to see the thinking state and the Stop button.

The Image, Music, Video and Code tools use the same frame: the sidebar lists past creations, the thread shows results, and the composer holds the prompt with the credit cost in its hint.
