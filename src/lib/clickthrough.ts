import { invoke } from "@tauri-apps/api/core";

const PADDING = 15;
let lastJson = "";
let intervalId: number | undefined;

export function startClickthroughTracking() {
  updateBounds();
  intervalId = window.setInterval(updateBounds, 100);
}

export function stopClickthroughTracking() {
  if (intervalId !== undefined) {
    window.clearInterval(intervalId);
    intervalId = undefined;
  }
}

export function lockClickthrough(locked: boolean) {
  invoke("set_clickthrough_lock", { locked });
}

function updateBounds() {
  const elements =
    document.querySelectorAll<HTMLElement>("[data-interactive]");
  const rects: { x: number; y: number; width: number; height: number }[] = [];

  elements.forEach((el) => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      rects.push({
        x: Math.round(r.x - PADDING),
        y: Math.round(r.y - PADDING),
        width: Math.round(r.width + PADDING * 2),
        height: Math.round(r.height + PADDING * 2),
      });
    }
  });

  const json = JSON.stringify(rects);
  if (json !== lastJson) {
    lastJson = json;
    invoke("update_interactive_bounds", { rects });
  }
}
