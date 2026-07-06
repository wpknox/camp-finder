// Moves a node to `document.body` (or another target) once mounted, so
// full-viewport `position: fixed` overlays (modal backdrops) aren't
// contained by a transformed/scrolling ancestor.
//
// CSS spec gotcha this works around: any non-none `transform` (even a
// no-op `translateY(0px)`) on an ancestor makes that ancestor the
// containing block for `position: fixed` descendants. DetailPanel's
// `.panel` carries such a transform (for the mobile swipe-to-dismiss
// gesture) and is itself a scroll container, so a `position: fixed`
// overlay nested inside it — e.g. the reviews modal, rendered deep
// inside RatingsSection — gets sized/positioned relative to `.panel`'s
// scrolled box instead of the viewport, and scrolls out of place instead
// of staying pinned. Portaling the overlay out to `<body>` sidesteps the
// containing-block issue entirely, regardless of what ancestors it's
// mounted under.
export function portal(node: HTMLElement, target: string | HTMLElement = "body") {
  function place() {
    const targetEl = typeof target === "string" ? document.querySelector(target) : target;
    targetEl?.appendChild(node);
  }
  place();
  return {
    destroy() {
      node.remove();
    },
  };
}
