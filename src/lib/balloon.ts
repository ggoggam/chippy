import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import BalloonComponent, { type BalloonHandle } from "../components/balloon";

export type { BalloonHandle };

export default class Balloon implements BalloonHandle {
  private _handle: BalloonHandle;
  private _container: HTMLDivElement;
  private _root: ReturnType<typeof createRoot>;

  constructor(targetEl: HTMLElement, characterName?: string) {
    this._container = document.createElement("div");
    document.body.appendChild(this._container);
    this._root = createRoot(this._container);
    const ref = createRef<BalloonHandle>();
    flushSync(() => {
      this._root.render(createElement(BalloonComponent, { ref, targetEl, characterName }));
    });
    this._handle = ref.current!;
  }

  speak(complete: () => void, text: string, hold?: boolean) { this._handle.speak(complete, text, hold); }
  speakStream(complete: () => void) { return this._handle.speakStream(complete); }
  show() { this._handle.show(); }
  hide(fast?: boolean) { this._handle.hide(fast); }
  close() { this._handle.close(); }
  pause() { this._handle.pause(); }
  resume() { this._handle.resume(); }
  reposition() { this._handle.reposition(); }
  enableInput(onSubmit: (text: string) => void) { this._handle.enableInput(onSubmit); }
  focusInput() { this._handle.focusInput(); }
  addMessage(role: "user" | "assistant", text: string) { this._handle.addMessage(role, text); }
  streamMessage() { return this._handle.streamMessage(); }

  dispose() {
    this._handle.dispose();
    this._root.unmount();
    this._container.remove();
  }
}
