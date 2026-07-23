export type FloatingVerticalPlacement = "down" | "up";

function isHorizontalClip(value: string) {
  return /(auto|scroll|hidden|clip)/.test(value);
}

function currentTranslateX(element: HTMLElement) {
  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;
  const match = transform.match(/^matrix(3d)?\((.+)\)$/);
  if (!match) return 0;
  const values = match[2].split(",").map(Number);
  return match[1] ? values[12] || 0 : values[4] || 0;
}

function clipBounds(anchor: HTMLElement) {
  let top = 12;
  let bottom = window.innerHeight - 12;
  let ancestor = anchor.parentElement;

  while (ancestor && ancestor !== document.body) {
    const style = window.getComputedStyle(ancestor);
    const overflow = `${style.overflow} ${style.overflowY}`;
    if (/(auto|scroll|hidden|clip)/.test(overflow)) {
      const rect = ancestor.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    ancestor = ancestor.parentElement;
  }

  return { top, bottom };
}

export function getFloatingVerticalPlacement(
  anchor: HTMLElement,
  floating: HTMLElement,
  gap = 8
): FloatingVerticalPlacement {
  const anchorRect = anchor.getBoundingClientRect();
  const floatingHeight = floating.getBoundingClientRect().height;
  const bounds = clipBounds(anchor);
  const spaceAbove = anchorRect.top - bounds.top - gap;
  const spaceBelow = bounds.bottom - anchorRect.bottom - gap;

  return spaceBelow < floatingHeight && spaceAbove > spaceBelow ? "up" : "down";
}

export function getFloatingHorizontalOffset(
  anchor: HTMLElement,
  floating: HTMLElement,
  viewportPadding = 8
) {
  const floatingRect = floating.getBoundingClientRect();
  if (!floatingRect.width) return 0;

  // The caller may retain a previous correction while the page scrolls. Measure
  // the popover's natural position so the correction does not oscillate.
  const translateX = currentTranslateX(floating);
  const naturalLeft = floatingRect.left - translateX;
  const naturalRight = floatingRect.right - translateX;

  let left = viewportPadding;
  let right = window.innerWidth - viewportPadding;
  let ancestor = anchor.parentElement;

  while (ancestor && ancestor !== document.body) {
    const style = window.getComputedStyle(ancestor);
    if (isHorizontalClip(style.overflowX)) {
      const rect = ancestor.getBoundingClientRect();
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
    }
    ancestor = ancestor.parentElement;
  }

  if (naturalLeft < left) return left - naturalLeft;
  if (naturalRight > right) return right - naturalRight;
  return 0;
}
