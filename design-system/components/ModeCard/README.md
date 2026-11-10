# ModeCard

A big tappable color field on the Home screen that opens one tool, with that tool's shape cut into its corner.

## Props
- `tool`: `chat | image | music | video | code`. Sets the color and the `ToolShape`. In Light the tile is the tool's tint (`sun-soft` and so on) with the shape in the full tool color. In Dark the tile is the full tool color with `on-` text, and the shape is cut out in `surface`, because dark tints of yellow and pink turn muddy.
- `title`: the one-word tool name.
- `description`: one plain sentence a child can read.
- `cost`: what one use costs ("1 credit", "Free"). Take the numbers from `calculateCredits`, never type them by hand.
- `hero`: the first, most-used tool (Chat). A solid `red-strong` field with `on-red` text (5:1) and a larger `red-soft` shape.
- `href` renders a link; otherwise pass `onClick` and it renders a button.

## Do and do not
- Do keep one tool per color everywhere: the tile, the header swatch and any chart.
- Do not add a shadow, a border or a gradient. The tint is the edge.
- Do not use marketing words ("stunning", "advanced", "powerful").
- Hover shows an `ink` outline on every tile, in both themes: 2px on tool tiles, 3px on the hero. In Dark, `ink` is white. The shape tips up (see Motion). The tile itself does not lift.

## Motion
- On hover and keyboard focus, the shape tips up 4px and 6°. Press makes the shape dip. All of this stops with reduced motion.
