export default class ChatInput {
  _targetEl: HTMLElement;
  _el: HTMLDivElement;
  _history: HTMLDivElement;
  _inputRow: HTMLDivElement;
  _input: HTMLInputElement;
  _toggleBtn: HTMLButtonElement;
  _onSubmit: (text: string) => void;
  _expanded: boolean;
  _observer: MutationObserver;

  constructor(targetEl: HTMLElement, onSubmit: (text: string) => void) {
    this._targetEl = targetEl;
    this._onSubmit = onSubmit;
    this._expanded = false;
    this._el = document.createElement("div");
    this._history = document.createElement("div");
    this._inputRow = document.createElement("div");
    this._input = document.createElement("input");
    this._toggleBtn = document.createElement("button");
    this._setup();
    // Reposition when agent element moves (drag, resize)
    this._observer = new MutationObserver(() => {
      if (this._targetEl.style.display !== "none") {
        this._el.style.display = "flex";
        this._reposition();
      }
    });
    this._observer.observe(targetEl, { attributes: true, attributeFilter: ["style"] });
  }

  _setup() {
    Object.assign(this._el.style, {
      position: "fixed",
      zIndex: "10002",
      display: "none", // shown by observer once agent is visible
      flexDirection: "column",
      width: "230px",
      background: "#d4d0c8",
      border: "2px solid",
      borderColor: "#ffffff #808080 #808080 #ffffff",
      boxShadow: "1px 1px 0 #000000",
    });

    // History panel (hidden by default)
    Object.assign(this._history.style, {
      display: "none",
      flexDirection: "column",
      gap: "2px",
      maxHeight: "150px",
      overflowY: "auto",
      padding: "5px 6px",
      borderBottom: "1px solid #808080",
      fontFamily: '"Tahoma", "Microsoft Sans Serif", sans-serif',
      fontSize: "10px",
      lineHeight: "1.5",
    });

    // Input row
    Object.assign(this._inputRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "5px 6px",
    });

    this._input.type = "text";
    this._input.placeholder = "Ask me something...";
    Object.assign(this._input.style, {
      flex: "1",
      minWidth: "0",
      fontFamily: '"Tahoma", "Microsoft Sans Serif", sans-serif',
      fontSize: "11px",
      border: "2px solid",
      borderColor: "#808080 #ffffff #ffffff #808080",
      background: "#ffffff",
      padding: "2px 4px",
      outline: "none",
    });
    this._input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submit();
      if (e.key === "Escape") this._input.blur();
    });

    const okBtn = document.createElement("button");
    okBtn.textContent = "OK";

    for (const btn of [okBtn, this._toggleBtn]) {
      Object.assign(btn.style, {
        fontFamily: '"Tahoma", "Microsoft Sans Serif", sans-serif',
        fontSize: "11px",
        background: "#d4d0c8",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        padding: "1px 6px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: "0",
      });
      btn.addEventListener("mousedown", (e) => e.preventDefault());
    }

    okBtn.addEventListener("click", () => this._submit());

    this._toggleBtn.textContent = "▲";
    this._toggleBtn.title = "Show history";
    this._toggleBtn.addEventListener("click", () => this._toggleHistory());

    this._inputRow.appendChild(this._input);
    this._inputRow.appendChild(okBtn);
    this._inputRow.appendChild(this._toggleBtn);

    this._el.appendChild(this._history);
    this._el.appendChild(this._inputRow);
    document.body.appendChild(this._el);
  }

  addMessage(role: "user" | "assistant", text: string) {
    const line = document.createElement("div");
    Object.assign(line.style, { paddingBottom: "2px" });
    const label = document.createElement("b");
    label.textContent = role === "user" ? "You: " : "Clippy: ";
    label.style.color = role === "user" ? "#000080" : "#006400";
    line.appendChild(label);
    line.appendChild(document.createTextNode(text));
    this._history.appendChild(line);
    this._history.scrollTop = this._history.scrollHeight;
  }

  _toggleHistory() {
    this._expanded = !this._expanded;
    this._history.style.display = this._expanded ? "flex" : "none";
    this._toggleBtn.textContent = this._expanded ? "▼" : "▲";
    this._toggleBtn.title = this._expanded ? "Hide history" : "Show history";
    this._reposition();
  }

  _submit() {
    const text = this._input.value.trim();
    if (!text) return;
    this._input.value = "";
    this._onSubmit(text);
  }

  show() {
    this._el.style.display = "flex";
    this._reposition();
    this._input.focus();
  }

  hide() {
    this._input.blur();
  }

  _reposition() {
    const o = this._targetEl.getBoundingClientRect();
    const elW = this._el.offsetWidth || 230;
    const elH = this._el.offsetHeight || 36;
    const margin = 8;

    let left = o.left + this._targetEl.offsetWidth - elW;
    let top = o.top - elH - margin;
    if (top < 5) top = o.top + this._targetEl.offsetHeight + margin;
    left = Math.max(5, Math.min(left, window.innerWidth - elW - 5));

    this._el.style.left = left + "px";
    this._el.style.top = top + "px";
  }

  dispose() {
    this._observer.disconnect();
    this._el.remove();
  }
}
