# 2026 Admin Navigation And Card Research

## Sources

- Nielsen Norman Group, [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/): advanced or less frequent choices should be deferred so the primary surface is easier to learn and less error-prone.
- Nielsen Norman Group, [Menu-Design Checklist](https://www.nngroup.com/articles/menu-design/): menus must prioritize findability, clear labels, stable placement, and recognizable interaction states.
- Nielsen Norman Group, [Cards: UI-Component Definition](https://www.nngroup.com/articles/cards-component/): cards are bounded content containers; use them for coherent repeated items rather than wrapping every page section.
- Midrocket, [UI Design Trends for 2026](https://midrocket.com/en/guides/ui-design-trends-2026/): Bento grids remain a visible 2026 pattern, but this project adopts only their information-weight and scanability benefits.
- Figma Simple Design System 2026 update: added Card Slot and wrapped repeatable navigation/card content in slots, supporting flexible component boundaries instead of one rigid list.
- Material 3 Design Kit 2026 update: expanded component slots and expressive navigation/menu structures. The project borrows flexibility and tactile state clarity, not Material styling.

## Applied Decisions

1. Keep the existing blue-white palette and current typography tokens.
2. Treat an expanded Admin group as one surface. Parent and children share one horizontal alignment system.
3. Replace the detached indented list with one full-width destination card per row, preserving the same parent/child boundary.
4. Use compact Bento spans only for operational metrics and repeated shortcuts, not page shells or forms.
5. Use progressive disclosure: one expanded group, one mounted destination, and no duplicate navigation source.
6. Use border, fill, and icon-color transitions only. No shadow, glass, gradient, scale, or decorative motion.

## Figma Evidence

- Pixel baseline capture: `https://www.figma.com/design/9L4qtWR33FEwLMZUqC9slS?node-id=1-2`
- Approved redesign frame: `https://www.figma.com/design/9L4qtWR33FEwLMZUqC9slS?node-id=4-3`
