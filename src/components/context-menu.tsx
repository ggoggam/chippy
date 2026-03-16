import { useEffect, useRef } from "react";

export type MenuItem =
  | { label: string; action: () => void; checked?: boolean }
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
    <div
      ref={menuRef}
      className="fixed z-[99999] bg-[#c0c0c0] text-black font-[MS_Sans_Serif,Tahoma,sans-serif] text-[11px] min-w-[150px] select-none p-[2px]"
      data-interactive
      style={{
        left: x,
        top: y,
        borderTop: "2px solid #fff",
        borderLeft: "2px solid #fff",
        borderRight: "2px solid #404040",
        borderBottom: "2px solid #404040",
        boxShadow: "1px 1px 0 #000",
      }}
    >
      {items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="mx-[2px] my-[3px]" style={{
            borderTop: "1px solid #808080",
            borderBottom: "1px solid #fff",
          }} />
        ) : (
          <div
            key={i}
            className="py-[3px] pr-[16px] pl-[2px] cursor-default whitespace-nowrap flex items-center gap-0.5 hover:bg-[#000080] hover:text-white"
            onClick={() => {
              onClose();
              item.action();
            }}
          >
            <span className="inline-block w-4 text-center text-[10px]">{item.checked ? "✓" : ""}</span>
            {item.label}
          </div>
        )
      )}
    </div>
  );
}
