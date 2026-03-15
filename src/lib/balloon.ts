export default class Balloon {
  _targetEl: HTMLElement;
  _balloon: HTMLDivElement;
  _content: HTMLDivElement;
  _tip: HTMLDivElement;
  _hidden: boolean;
  _active: boolean;
  _hold: boolean;
  _hiding: number | null;
  WORD_SPEAK_TIME: number;
  CLOSE_BALLOON_DELAY: number;
  _BALLOON_MARGIN: number;
  _complete: Function;
  _addWord: Function | undefined;
  _loop: number | undefined;
  _inputSection: HTMLDivElement | null;
  _historyEl: HTMLDivElement | null;
  _historyToggleBtn: HTMLButtonElement | null;
  _historyExpanded: boolean;
  _onSubmit: ((text: string) => void) | null;

  constructor(targetEl: HTMLElement) {
    this._targetEl = targetEl;
    this._hidden = true;
    this._active = false;
    this._hold = false;
    this._hiding = null;
    this._complete = () => {};
    this._inputSection = null;
    this._historyEl = null;
    this._historyToggleBtn = null;
    this._historyExpanded = false;
    this._onSubmit = null;
    this.WORD_SPEAK_TIME = 200;
    this.CLOSE_BALLOON_DELAY = 5000;
    this._BALLOON_MARGIN = 15;
    this._balloon = document.createElement("div");
    this._content = document.createElement("div");
    this._tip = document.createElement("div");
    this._setup();
  }

  _setup() {
    Object.assign(this._balloon.style, {
      position: "fixed",
      zIndex: "10001",
      cursor: "pointer",
      background: "#ffc",
      color: "black",
      padding: "8px",
      border: "1px solid black",
      borderRadius: "5px",
      display: "none",
      maxWidth: "230px",
    });

    Object.assign(this._tip.style, {
      width: "10px",
      height: "16px",
      background:
        "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAgCAMAAAAlvKiEAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAAlQTFRF///MAAAA////52QwgAAAAAN0Uk5T//8A18oNQQAAAGxJREFUeNqs0kEOwCAIRFHn3//QTUU6xMyyxii+jQosrTPkyPEM6IN3FtzIRk1U4dFeKWQiH6pRRowMVKEmvronEynkwj0uZJgR22+YLopPSo9P34wJSamLSU7lSIWLJU7NkNomNlhqxUeAAQC+TQLZyEuJBwAAAABJRU5ErkJggg==) no-repeat",
      position: "absolute",
    });

    Object.assign(this._content.style, {
      maxWidth: "200px",
      minWidth: "120px",
      fontFamily: '"Microsoft Sans Serif", sans-serif',
      fontSize: "10pt",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      overflowWrap: "break-word",
    });

    this._balloon.appendChild(this._tip);
    this._balloon.appendChild(this._content);
    document.body.appendChild(this._balloon);
  }

  reposition() {
    let sides = ["top-left", "top-right", "bottom-left", "bottom-right"];
    for (let i = 0; i < sides.length; i++) {
      this._position(sides[i]);
      if (!this._isOut()) break;
    }
  }

  _position(side: string) {
    let o = this._targetEl.getBoundingClientRect();
    let h = this._targetEl.offsetHeight;
    let w = this._targetEl.offsetWidth;
    let bH = this._balloon.offsetHeight;
    let bW = this._balloon.offsetWidth;
    let left = 0, top = 0;
    switch (side) {
      case "top-left":
        left = o.left + w - bW;
        top = o.top - bH - this._BALLOON_MARGIN;
        break;
      case "top-right":
        left = o.left;
        top = o.top - bH - this._BALLOON_MARGIN;
        break;
      case "bottom-right":
        left = o.left;
        top = o.top + h + this._BALLOON_MARGIN;
        break;
      case "bottom-left":
        left = o.left + w - bW;
        top = o.top + h + this._BALLOON_MARGIN;
        break;
    }
    this._balloon.style.top = top + "px";
    this._balloon.style.left = left + "px";
    this._positionTip(side);
  }

  _positionTip(side: string) {
    const s = this._tip.style;
    s.top = ""; s.left = ""; s.marginTop = ""; s.marginLeft = ""; s.backgroundPosition = "";
    switch (side) {
      case "top-left":
        s.top = "100%"; s.marginTop = "0px"; s.left = "100%"; s.marginLeft = "-50px"; break;
      case "top-right":
        s.top = "100%"; s.marginTop = "0px"; s.left = "0"; s.marginLeft = "50px";
        s.backgroundPosition = "-10px 0"; break;
      case "bottom-right":
        s.top = "0"; s.marginTop = "-16px"; s.left = "0"; s.marginLeft = "50px";
        s.backgroundPosition = "-10px -16px"; break;
      case "bottom-left":
        s.top = "0"; s.marginTop = "-16px"; s.left = "100%"; s.marginLeft = "-50px";
        s.backgroundPosition = "0px -16px"; break;
    }
  }

  _isOut() {
    let o = this._balloon.getBoundingClientRect();
    let bH = this._balloon.offsetHeight;
    let bW = this._balloon.offsetWidth;
    let wW = window.innerWidth;
    let wH = window.innerHeight;
    let top = o.top;
    let left = o.left;
    let m = 5;
    if (top - m < 0 || left - m < 0) return true;
    return top + bH + m > wH || left + bW + m > wW;
  }

  speak(complete: Function, text: string, hold?: boolean) {
    this._hidden = false;
    this.show();
    let c = this._content;
    c.style.height = "auto";
    c.style.width = "auto";
    c.textContent = text;
    let w = c.offsetWidth;
    c.style.width = w + "px";
    c.style.height = c.offsetHeight + "px";
    c.textContent = "";
    this.reposition();
    this._complete = complete;
    this._sayWords(text, hold ?? false, complete);
  }

  show() {
    if (this._hidden) return;
    this._balloon.style.display = "block";
  }

  hide(fast?: boolean) {
    if (this._hiding) { window.clearTimeout(this._hiding); this._hiding = null; }
    if (fast) {
      this._balloon.style.display = "none";
      return;
    }
    this._hiding = window.setTimeout(this._finishHideBalloon.bind(this), this.CLOSE_BALLOON_DELAY);
  }

  _finishHideBalloon() {
    if (this._active) return;
    if (this._onSubmit) return; // keep visible when input is enabled
    this._balloon.style.display = "none";
    this._hidden = true;
    this._hiding = null;
  }

  _sayWords(text: string, hold: boolean, complete: Function) {
    this._active = true;
    this._hold = hold;
    let words = text.split(/( +|\n)/);
    let time = this.WORD_SPEAK_TIME;
    let el = this._content;
    let idx = 1;
    this._addWord = () => {
      if (!this._active) return;
      if (idx > words.length) {
        delete this._addWord;
        this._active = false;
        if (!this._hold) {
          complete();
          this.hide();
        }
      } else {
        el.textContent = words.slice(0, idx).join("");
        idx += 2;
        this._loop = window.setTimeout(this._addWord!, time);
      }
    };
    this._addWord();
  }

  speakStream(complete: Function): { push: (chunk: string) => void; done: () => void } {
    if (this._hiding) { window.clearTimeout(this._hiding); this._hiding = null; }
    this._hidden = false;
    this._active = true;
    this._hold = true;
    this._complete = complete;
    this.show();
    let c = this._content;
    c.style.height = "auto";
    c.style.width = "auto";
    c.textContent = "";
    this.reposition();
    let text = "";
    let dots = 0;
    const loadingInterval = window.setInterval(() => {
      dots = (dots % 3) + 1;
      c.textContent = ".".repeat(dots);
      c.style.height = "auto";
      c.style.width = "auto";
      this.reposition();
    }, 400);
    return {
      push: (chunk: string) => {
        if (!text) { window.clearInterval(loadingInterval); }
        text += chunk;
        c.textContent = text;
        c.style.height = "auto";
        c.style.width = "auto";
        let w = c.offsetWidth;
        c.style.width = w + "px";
        c.style.height = c.offsetHeight + "px";
        this.reposition();
      },
      done: () => {
        window.clearInterval(loadingInterval);
        this._active = false;
        this._hold = false;
        complete();
        // Leave balloon visible — it stays showing the last response
      },
    };
  }

  close() {
    if (this._active) {
      this._hold = false;
    } else if (this._hold) {
      this._complete();
    }
  }

  pause() {
    window.clearTimeout(this._loop);
    if (this._hiding) {
      window.clearTimeout(this._hiding);
      this._hiding = null;
    }
  }

  resume() {
    if (this._addWord) {
      this._addWord();
    } else if (!this._hold && !this._hidden) {
      this._hiding = window.setTimeout(this._finishHideBalloon.bind(this), this.CLOSE_BALLOON_DELAY);
    }
  }

  enableInput(onSubmit: (text: string) => void) {
    this._onSubmit = onSubmit;
    if (!this._inputSection) {
      this._buildInputSection();
    }
    this._balloon.style.width = "230px";
    this._hidden = false;
    this._balloon.style.display = "block";
    this.reposition();
  }

  focusInput() {
    if (!this._inputSection) return;
    (this._inputSection.querySelector("input") as HTMLInputElement)?.focus();
  }

  addMessage(role: "user" | "assistant", text: string) {
    if (!this._historyEl) return;
    const line = document.createElement("div");
    const label = document.createElement("b");
    label.textContent = role === "user" ? "You: " : "Clippy: ";
    label.style.color = role === "user" ? "#000080" : "#006400";
    line.appendChild(label);
    line.appendChild(document.createTextNode(text));
    this._historyEl.appendChild(line);
    this._historyEl.scrollTop = this._historyEl.scrollHeight;
  }

  _buildInputSection() {
    const sep = document.createElement("div");
    Object.assign(sep.style, { borderTop: "1px solid #888", margin: "4px -8px 2px" });

    this._historyEl = document.createElement("div");
    Object.assign(this._historyEl.style, {
      display: "none",
      flexDirection: "column",
      maxHeight: "120px",
      overflowY: "auto",
      padding: "4px 0 2px",
      fontFamily: '"Microsoft Sans Serif", sans-serif',
      fontSize: "10px",
      lineHeight: "1.4",
    });

    const inputRow = document.createElement("div");
    Object.assign(inputRow.style, { display: "flex", alignItems: "center", gap: "4px", paddingTop: "4px" });

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Ask me something...";
    Object.assign(input.style, {
      flex: "1",
      minWidth: "0",
      fontFamily: '"Microsoft Sans Serif", sans-serif',
      fontSize: "10px",
      border: "1px inset #888",
      background: "#fff",
      padding: "2px 4px",
      outline: "none",
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submitInput(input);
      if (e.key === "Escape") input.blur();
    });

    const okBtn = document.createElement("button");
    okBtn.textContent = "OK";
    this._historyToggleBtn = document.createElement("button");
    this._historyToggleBtn.textContent = "▲";
    this._historyToggleBtn.title = "Show history";

    for (const btn of [okBtn, this._historyToggleBtn]) {
      Object.assign(btn.style, {
        fontFamily: '"Microsoft Sans Serif", sans-serif',
        fontSize: "10px",
        background: "#d4d0c8",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        padding: "1px 5px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: "0",
      });
      btn.addEventListener("mousedown", (e) => e.preventDefault());
    }

    okBtn.addEventListener("click", () => this._submitInput(input));
    this._historyToggleBtn.addEventListener("click", () => this._toggleHistory());

    inputRow.appendChild(input);
    inputRow.appendChild(okBtn);
    inputRow.appendChild(this._historyToggleBtn);

    this._inputSection = document.createElement("div");
    this._inputSection.appendChild(sep);
    this._inputSection.appendChild(this._historyEl);
    this._inputSection.appendChild(inputRow);
    this._balloon.appendChild(this._inputSection);
  }

  _submitInput(input: HTMLInputElement) {
    const text = input.value.trim();
    if (!text || !this._onSubmit) return;
    input.value = "";
    this._onSubmit(text);
  }

  _toggleHistory() {
    this._historyExpanded = !this._historyExpanded;
    this._historyEl!.style.display = this._historyExpanded ? "flex" : "none";
    this._historyToggleBtn!.textContent = this._historyExpanded ? "▼" : "▲";
    this._historyToggleBtn!.title = this._historyExpanded ? "Hide history" : "Show history";
    this.reposition();
  }

  dispose() {
    window.clearTimeout(this._loop);
    if (this._hiding) { window.clearTimeout(this._hiding); this._hiding = null; }
    this._active = false;
    this._addWord = undefined;
    this._balloon.remove();
  }
}
