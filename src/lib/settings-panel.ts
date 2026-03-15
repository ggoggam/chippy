export default class SettingsPanel {
  _targetEl: HTMLElement;
  _el: HTMLDivElement;
  _input: HTMLInputElement;
  _onSave: (key: string) => void;

  constructor(targetEl: HTMLElement, onSave: (key: string) => void) {
    this._targetEl = targetEl;
    this._onSave = onSave;
    this._el = document.createElement("div");
    this._input = document.createElement("input");
    this._setup();
  }

  _setup() {
    Object.assign(this._el.style, {
      position: "fixed",
      zIndex: "10002",
      display: "none",
      flexDirection: "column",
      gap: "6px",
      background: "#d4d0c8",
      border: "2px solid",
      borderColor: "#ffffff #808080 #808080 #ffffff",
      padding: "8px",
      boxShadow: "1px 1px 0 #000000",
    });

    const label = document.createElement("div");
    label.textContent = "Anthropic API Key:";
    Object.assign(label.style, {
      fontFamily: '"Tahoma", "Microsoft Sans Serif", sans-serif',
      fontSize: "11px",
    });

    this._input.type = "password";
    this._input.placeholder = "sk-ant-...";
    Object.assign(this._input.style, {
      width: "220px",
      fontFamily: '"Tahoma", "Microsoft Sans Serif", sans-serif',
      fontSize: "11px",
      border: "2px solid",
      borderColor: "#808080 #ffffff #ffffff #808080",
      background: "#ffffff",
      padding: "2px 4px",
      outline: "none",
    });
    this._input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._save();
      if (e.key === "Escape") this.hide();
    });

    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "4px" });

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    for (const btn of [saveBtn, cancelBtn]) {
      Object.assign(btn.style, {
        fontFamily: '"Tahoma", "Microsoft Sans Serif", sans-serif',
        fontSize: "11px",
        background: "#d4d0c8",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        padding: "2px 10px",
        cursor: "pointer",
      });
      btn.addEventListener("mousedown", (e) => e.preventDefault());
    }
    saveBtn.addEventListener("click", () => this._save());
    cancelBtn.addEventListener("click", () => this.hide());

    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);
    this._el.appendChild(label);
    this._el.appendChild(this._input);
    this._el.appendChild(row);
    document.body.appendChild(this._el);

    document.addEventListener("mousedown", (e) => {
      if (this._el.style.display !== "none" && !this._el.contains(e.target as Node)) {
        this.hide();
      }
    });
  }

  _save() {
    const key = this._input.value.trim();
    if (!key) return;
    this._input.value = "";
    this.hide();
    this._onSave(key);
  }

  show(currentKey?: string | null) {
    if (currentKey) this._input.value = currentKey;
    this._el.style.display = "flex";
    this._reposition();
    this._input.focus();
    this._input.select();
  }

  hide() {
    this._el.style.display = "none";
    this._input.value = "";
  }

  _reposition() {
    const o = this._targetEl.getBoundingClientRect();
    const elW = this._el.offsetWidth || 254;
    const elH = this._el.offsetHeight || 88;
    const margin = 12;

    let left = o.left + this._targetEl.offsetWidth - elW;
    let top = o.top - elH - margin;
    if (top < 5) top = o.top + this._targetEl.offsetHeight + margin;
    left = Math.max(5, Math.min(left, window.innerWidth - elW - 5));

    this._el.style.left = left + "px";
    this._el.style.top = top + "px";
  }

  dispose() {
    this._el.remove();
  }
}
