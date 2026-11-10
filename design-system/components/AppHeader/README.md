# AppHeader

The top bar on every signed-in screen: the logo, a Home button on tool screens, then on the right the tool name, credits and account actions.

## Props
- `logoSrc`: the logo image URL, always `lib-logo.png`. The header shows the same logo in Light and in Dark.
- `title`: the current tool ("Chat", "Image"). It sits on the right, before `children` and the credits. Leave it out on Home.
- `tool`: `chat | image | music | video | code`. Shows the small `ToolShape` before the title, so the header carries the tool's color.
- `onBack`: shows a "Home" button with a back arrow, just after the logo. Use it on tool screens.
- `credits`, `renewsAt`: shows a `CreditBadge`.
- `onAccount`, `onToggleTheme`, `theme`, `onSignOut`, `signOutLabel`: the account actions. Omit `onAccount` for guests. Guests may use `signOutLabel="End session"`.
- `children`: extra items before the credits.

## Do and do not
- Do keep the logo first on every screen, so it never moves when a patron opens a tool.
- Do keep every header item labelled with a word.
- Do not put more than five items on the right.
- Below 820px (1200px on tool screens), move the account items into a menu. Below 820px, hide the Home button and keep the logo.
