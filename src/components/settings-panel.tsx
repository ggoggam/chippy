import { useState, useEffect, useRef } from "react";

interface SettingsPanelProps {
  targetEl: HTMLElement | null;
  currentKey: string | null;
  onSave: (key: string) => void;
  onClose: () => void;
}

const WIN98_FONT = "font-[Tahoma,Microsoft_Sans_Serif,sans-serif] text-[11px]";
const WIN98_BORDER = "border-2 border-solid border-t-white border-l-white border-b-[#808080] border-r-[#808080]";
const WIN98_BORDER_INSET = "border-2 border-solid border-t-[#808080] border-l-[#808080] border-b-white border-r-white";

export default function SettingsPanel({ targetEl, currentKey, onSave, onClose }: SettingsPanelProps) {
  const [value, setValue] = useState(currentKey ?? "");
  const elRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(currentKey ?? "");
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [currentKey]);

  useEffect(() => {
    reposition();
    const onMouseDown = (e: MouseEvent) => {
      if (elRef.current && !elRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  function reposition() {
    if (!targetEl || !elRef.current) return;
    const o = targetEl.getBoundingClientRect();
    const elW = elRef.current.offsetWidth || 254;
    const elH = elRef.current.offsetHeight || 88;
    const margin = 12;
    let left = o.left + targetEl.offsetWidth - elW;
    let top = o.top - elH - margin;
    if (top < 5) top = o.top + targetEl.offsetHeight + margin;
    left = Math.max(5, Math.min(left, window.innerWidth - elW - 5));
    elRef.current.style.left = left + "px";
    elRef.current.style.top = top + "px";
  }

  function handleSave() {
    const key = value.trim();
    if (!key) return;
    setValue("");
    onSave(key);
    onClose();
  }

  return (
    <div
      ref={elRef}
      data-interactive
      className={`fixed z-[10002] flex flex-col gap-1.5 bg-[#d4d0c8] ${WIN98_BORDER} p-2 shadow-[1px_1px_0_#000000]`}
    >
      <div className={WIN98_FONT}>Anthropic API Key:</div>
      <input
        ref={inputRef}
        type="password"
        placeholder="sk-ant-..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") onClose();
        }}
        className={`w-[220px] ${WIN98_FONT} ${WIN98_BORDER_INSET} bg-white py-[2px] px-1 outline-none`}
      />
      <div className="flex gap-1">
        <button className={`${WIN98_FONT} bg-[#d4d0c8] ${WIN98_BORDER} py-[2px] px-2.5 cursor-pointer`} onClick={handleSave}>Save</button>
        <button className={`${WIN98_FONT} bg-[#d4d0c8] ${WIN98_BORDER} py-[2px] px-2.5 cursor-pointer`} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
