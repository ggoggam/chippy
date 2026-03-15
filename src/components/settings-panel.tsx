import { useState, useEffect, useRef } from "react";

interface SettingsPanelProps {
  targetEl: HTMLElement | null;
  currentKey: string | null;
  onSave: (key: string) => void;
  onClose: () => void;
}

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
    <div ref={elRef} data-interactive style={panelStyle}>
      <div style={labelStyle}>Anthropic API Key:</div>
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
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: "4px" }}>
        <button style={btnStyle} onClick={handleSave}>Save</button>
        <button style={btnStyle} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 10002,
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  background: "#d4d0c8",
  border: "2px solid",
  borderColor: "#ffffff #808080 #808080 #ffffff",
  padding: "8px",
  boxShadow: "1px 1px 0 #000000",
};

const labelStyle: React.CSSProperties = {
  fontFamily: '"Tahoma", "Microsoft Sans Serif", sans-serif',
  fontSize: "11px",
};

const inputStyle: React.CSSProperties = {
  width: "220px",
  fontFamily: '"Tahoma", "Microsoft Sans Serif", sans-serif',
  fontSize: "11px",
  border: "2px solid",
  borderColor: "#808080 #ffffff #ffffff #808080",
  background: "#ffffff",
  padding: "2px 4px",
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  fontFamily: '"Tahoma", "Microsoft Sans Serif", sans-serif',
  fontSize: "11px",
  background: "#d4d0c8",
  border: "2px solid",
  borderColor: "#ffffff #808080 #808080 #ffffff",
  padding: "2px 10px",
  cursor: "pointer",
};
