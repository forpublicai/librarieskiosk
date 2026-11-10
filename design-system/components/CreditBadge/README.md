# CreditBadge

Shows how many credits the patron has left as a neutral pill with a yellow coin and a number, and warns when they run low.

## Props
- `credits`: the number left.
- `renewsAt`: text for the tooltip, for example "Monday at 12:00 AM".
- `lowAt`: at or below this number the coin becomes a `danger` alert icon, the number turns `danger`, and the word "left" is added. The pill itself never fills with color. Default 5.

## Do and do not
- Do show the credit cost next to each action too ("Uses 1 credit").
- Do not hide the badge from guests; they have credits too.
