# ToolShape

The solid shape that stands for each tool: a speech bubble for Chat, a sun over a hill for Image, sound rings for Music, a play triangle for Video and the logo chevron for Code.

## Props
- `tool`: `chat | image | music | video | code`.
- `size`: pixels, default 120. Use 28 in the header, 112 in tiles, 168 in the hero tile.

## Do and do not
- Do place it in a tile's corner, fully inside the tile with clear space from the edge, or beside the tool name in the header.
- Do keep the fill in the tool color on a tint. On a full tool-color field (Dark tiles, the cover) the shape is cut out in `surface`. Image's hill is always `ink`.
- Do not put text over a shape, scatter shapes as background decoration, or animate them.
