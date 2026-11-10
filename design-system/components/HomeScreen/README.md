# HomeScreen

The Home screen after sign-in, built only from system parts. It is a showcase page, not a component to import.

- `AppHeader` with the logo, credits and account actions.
- One `display` greeting that names a signed-in patron: "Hi Sam, what would you like to do today?". Guests see the same question with no name. There is no `Highlight` and no line under it. The tiles sit `space-6` below.
- An uneven grid of `ModeCard`s: the red Chat hero takes two columns and two rows on the left; Image, Music, Video and Code sit two by two on the right, `space-4` apart. One tile per row below 600px.
- An info `Notice` that offers the guided tour to first-time patrons.
