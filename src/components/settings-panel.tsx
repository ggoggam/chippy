import { useState, useEffect, useRef } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { PROVIDERS, type Provider } from "../lib/llm";

interface SettingsPanelProps {
  targetEl: HTMLElement | null;
  getKey: (provider: Provider) => string | null;
  onSave: (provider: Provider, key: string) => void;
  onClose: () => void;
}

const WIN98_FONT = "font-[Tahoma,Microsoft_Sans_Serif,sans-serif] text-[11px]";
const WIN98_BORDER =
  "border-2 border-solid border-t-white border-l-white border-b-[#808080] border-r-[#808080]";
const WIN98_BORDER_INSET =
  "border-2 border-solid border-t-[#808080] border-l-[#808080] border-b-white border-r-white";

const PROVIDER_KEYS: Provider[] = ["anthropic", "openai", "google"];

export default function SettingsPanel({
  targetEl,
  getKey,
  onSave,
  onClose,
}: SettingsPanelProps) {
  const [values, setValues] = useState<Record<Provider, string>>(() => ({
    anthropic: getKey("anthropic") ?? "",
    openai: getKey("openai") ?? "",
    google: getKey("google") ?? "",
  }));
  const elRef = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setValues({
      anthropic: getKey("anthropic") ?? "",
      openai: getKey("openai") ?? "",
      google: getKey("google") ?? "",
    });
  }, [getKey]);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
    check()
      .then((u) => setUpdate(u))
      .catch(() => {});
  }, []);

  function reposition() {
    if (!targetEl || !elRef.current) return;
    const o = targetEl.getBoundingClientRect();
    const elW = elRef.current.offsetWidth || 280;
    const elH = elRef.current.offsetHeight || 200;
    const margin = 12;
    let left = o.left + targetEl.offsetWidth - elW;
    let top = o.top - elH - margin;
    if (top < 5) top = o.top + targetEl.offsetHeight + margin;
    left = Math.max(5, Math.min(left, window.innerWidth - elW - 5));
    elRef.current.style.left = left + "px";
    elRef.current.style.top = top + "px";
  }

  useEffect(() => {
    reposition();
    const onMouseDown = (e: MouseEvent) => {
      if (elRef.current && !elRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  function handleSave() {
    for (const p of PROVIDER_KEYS) {
      const key = values[p].trim();
      if (key) onSave(p, key);
    }
    onClose();
  }

  return (
    <div
      ref={elRef}
      data-interactive
      className={`fixed z-[10002] flex flex-col gap-2 bg-[#d4d0c8] ${WIN98_BORDER} p-2 shadow-[1px_1px_0_#000000]`}
    >
      {PROVIDER_KEYS.map((p) => (
        <div key={p} className="flex flex-col gap-0.5">
          <div className={WIN98_FONT}>{PROVIDERS[p].label} API Key:</div>
          <input
            type="password"
            placeholder={PROVIDERS[p].keyPlaceholder}
            value={values[p]}
            onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onClose();
            }}
            className={`w-[240px] ${WIN98_FONT} ${WIN98_BORDER_INSET} bg-white py-[2px] px-1 outline-none`}
          />
        </div>
      ))}
      {version && (
        <div
          className={`${WIN98_FONT} text-[#808080] flex items-center justify-between`}
        >
          <span>
            v{version}
            {update ? ` → v${update.version}` : " (latest)"} by ggoggam
          </span>
          {update && (
            <button
              className={`${WIN98_FONT} bg-[#d4d0c8] ${WIN98_BORDER} py-[1px] px-2 cursor-pointer`}
              disabled={updating}
              onClick={async () => {
                setUpdating(true);
                await update.downloadAndInstall();
                setUpdating(false);
              }}
            >
              {updating ? "Updating..." : "Update"}
            </button>
          )}
        </div>
      )}
      <div className="flex gap-1">
        <button
          className={`${WIN98_FONT} bg-[#d4d0c8] ${WIN98_BORDER} py-[2px] px-2.5 cursor-pointer`}
          onClick={handleSave}
        >
          Save
        </button>
        <button
          className={`${WIN98_FONT} bg-[#d4d0c8] ${WIN98_BORDER} py-[2px] px-2.5 cursor-pointer`}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
