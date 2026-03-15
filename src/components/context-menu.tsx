import { useEffect, useRef } from "react";

export type MenuItem =
  | { label: string; action: () => void }
  | "separator";

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    // Adjust if menu overflows viewport
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = x - rect.width + "px";
    if (rect.bottom > window.innerHeight) el.style.top = y - rect.height + "px";

    const dismiss = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", dismiss), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", dismiss);
    };
  }, [x, y, onClose]);

  return (
    <div ref={menuRef} className="context-menu" data-interactive style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item === "separator" ? (
          <hr key={i} className="context-menu-separator" />
        ) : (
          <div
            key={i}
            className="context-menu-item"
            onClick={() => {
              onClose();
              item.action();
            }}
          >
            {item.label}
          </div>
        )
      )}
    </div>
  );
}
