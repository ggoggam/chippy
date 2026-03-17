import { useEffect, useRef, useState } from "react";

export type MenuItem =
  | { label: string; action: () => void; checked?: boolean }
  | { label: string; disabled: true }
  | { label: string; submenu: MenuItem[] }
  | "separator";

const MENU_STYLE: React.CSSProperties = {
  borderTop: "2px solid #fff",
  borderLeft: "2px solid #fff",
  borderRight: "2px solid #404040",
  borderBottom: "2px solid #404040",
  boxShadow: "1px 1px 0 #000",
};

const BASE_CLS = "fixed z-[99999] bg-[#c0c0c0] text-black font-[MS_Sans_Serif,Tahoma,sans-serif] text-[11px] min-w-[150px] select-none p-[2px]";

interface SubMenuProps {
  items: MenuItem[];
  onClose: () => void;
  x: number;
  y: number;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
}

function SubMenu({ items, onClose, x, y, onHoverEnter, onHoverLeave }: SubMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [subPos, setSubPos] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjust position to stay within viewport
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = x - rect.width + "px";
    if (rect.bottom > window.innerHeight) el.style.top = y - rect.height + "px";
  }, [x, y]);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };
  const startTimer = () => {
    clearTimer();
    timerRef.current = setTimeout(() => { setOpenIdx(null); setSubPos(null); }, 150);
  };

  const openSub = (idx: number, el: HTMLDivElement) => {
    clearTimer();
    onHoverEnter?.();
    const rect = el.getBoundingClientRect();
    setOpenIdx(idx);
    setSubPos({ x: rect.right - 2, y: rect.top - 2 });
  };

  const closeSub = () => {
    startTimer();
    onHoverLeave?.();
  };

  const clearSubOnActionItem = () => {
    clearTimer();
    onHoverEnter?.();
    setOpenIdx(null);
    setSubPos(null);
  };

  return (
    <>
      <div ref={menuRef} className={BASE_CLS} data-interactive style={{ ...MENU_STYLE, left: x, top: y }}>
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {items.map((item, i) => {
          if (item === "separator") {
            return (
              <div key={i} className="mx-[2px] my-[3px]" style={{
                borderTop: "1px solid #808080",
                borderBottom: "1px solid #fff",
              }} />
            );
          }

          if ("disabled" in item && item.disabled) {
            return (
              <div key={i} className="py-[3px] pr-2 pl-[2px] cursor-default whitespace-nowrap flex items-center gap-0.5 text-[#808080]">
                <span className="inline-block w-4" />
                {item.label}
              </div>
            );
          }

          if ("submenu" in item) {
            const isOpen = openIdx === i;
            return (
              <div
                key={i}
                className={`py-[3px] pl-[2px] pr-1 cursor-default whitespace-nowrap flex items-center justify-between gap-1 ${isOpen ? "bg-[#000080] text-white" : "hover:bg-[#000080] hover:text-white"}`}
                onMouseEnter={(e) => openSub(i, e.currentTarget)}
                onMouseLeave={closeSub}
              >
                <div className="flex items-center gap-0.5">
                  <span className="inline-block w-4" />
                  {item.label}
                </div>
                <span className="text-[9px] ml-2">►</span>
              </div>
            );
          }

          // action item
          return (
            <div
              key={i}
              className="py-[3px] pr-[16px] pl-[2px] cursor-default whitespace-nowrap flex items-center gap-0.5 hover:bg-[#000080] hover:text-white"
              onMouseEnter={clearSubOnActionItem}
              onMouseLeave={() => { startTimer(); onHoverLeave?.(); }}
              onClick={() => { onClose(); (item as { action: () => void }).action(); }}
            >
              <span className="inline-block w-4 text-center text-[10px]">
                {"checked" in item && item.checked ? "✓" : ""}
              </span>
              {item.label}
            </div>
          );
          })}
        </div>
      </div>

      {openIdx !== null && subPos && typeof items[openIdx] === "object" && "submenu" in (items[openIdx] as object) && (
        <SubMenu
          items={(items[openIdx] as { submenu: MenuItem[] }).submenu}
          onClose={onClose}
          x={subPos.x}
          y={subPos.y}
          onHoverEnter={clearTimer}
          onHoverLeave={startTimer}
        />
      )}
    </>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <>
      {/* Full-screen backdrop to capture clicks outside the menu */}
      <div className="fixed inset-0 z-[99998]" onMouseDown={onClose} />
      <SubMenu items={items} onClose={onClose} x={x} y={y} />
    </>
  );
}
