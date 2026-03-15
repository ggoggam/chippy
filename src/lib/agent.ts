import Queue from "./queue";
import Animator from "./animator";
import Balloon from "./balloon";
import { lockClickthrough } from "./clickthrough";

export interface AgentLoaders {
  agent: () => Promise<{ default: any }>;
  sound: () => Promise<{ default: any }>;
  map: () => Promise<{ default: string }>;
}

export default class Agent {
  _queue: Queue;
  _el: HTMLElement;
  _animator: Animator;
  _balloon: Balloon;
  _hidden: boolean;
  _idlePromise: Promise<void> | null;
  _idleResolve: Function | null;
  _resizeHandle: () => void;
  _dblClickHandle: () => void;
  _tts: { rate: number; pitch: number; voice: string } | undefined;

  constructor(mapUrl: string, data: any, sounds: any, characterName?: string) {
    this._queue = new Queue(this._onQueueEmpty.bind(this));
    this._hidden = false;
    this._idlePromise = null;
    this._idleResolve = null;
    this._resizeHandle = () => {};
    this._dblClickHandle = () => {};

    this._el = document.createElement("div");
    Object.assign(this._el.style, {
      position: "fixed",
      zIndex: "10001",
      cursor: "pointer",
      display: "none",
      touchAction: "none",
    });
    this._el.setAttribute("data-interactive", "");
    document.body.appendChild(this._el);

    this._animator = new Animator(this._el, mapUrl, data, sounds);
    this._balloon = new Balloon(this._el, characterName);
    this._tts = data.tts;
    this._setupEvents();
  }

  gestureAt(x: number, y: number) {
    let d = this._getDirection(x, y);
    let gAnim = "Gesture" + d;
    let lookAnim = "Look" + d;
    let animation = this.hasAnimation(gAnim) ? gAnim : lookAnim;
    return this.play(animation);
  }

  hide(fast?: boolean, callback?: Function) {
    this._hidden = true;
    let el = this._el;
    this.stop();
    if (fast) {
      this._el.style.display = "none";
      this.pause();
      if (callback) callback();
      return;
    }
    return this._playInternal("Hide", function (_name: string, state: number) {
      if (state === Animator.States.EXITED) {
        el.style.display = "none";
        if (callback) callback();
      }
    });
  }

  moveTo(x: number, y: number, duration?: number) {
    let dir = this._getDirection(x, y);
    let anim = "Move" + dir;
    if (duration === undefined) duration = 1000;
    this._addToQueue(function (this: Agent, complete: Function) {
      let clamped = this._clampXY(x, y);
      let cx = clamped.x;
      let cy = clamped.y;
      if (duration === 0) {
        this._el.style.top = cy + "px";
        this._el.style.left = cx + "px";
        this.reposition();
        complete();
        return;
      }
      if (!this.hasAnimation(anim)) {
        this._animate(this._el, { top: cy, left: cx }, duration!, complete);
        return;
      }
      let callback = (_name: string, state: number) => {
        if (state === Animator.States.EXITED) complete();
        if (state === Animator.States.WAITING) {
          this._animate(this._el, { top: cy, left: cx }, duration!, () => {
            this._animator.exitAnimation();
          });
        }
      };
      this._playInternal(anim, callback);
    }, this);
  }

  _animate(element: HTMLElement, props: Record<string, number>, duration: number, callback?: Function) {
    const start = performance.now();
    const startProps: Record<string, number> = {};
    for (let prop in props) {
      startProps[prop] = parseFloat((getComputedStyle(element) as any)[prop]) || 0;
    }
    const swing = (p: number) => 0.5 - Math.cos(p * Math.PI) / 2;
    const animate = (currentTime: number) => {
      const elapsed = currentTime - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = swing(progress);
      for (let prop in props) {
        const startValue = startProps[prop];
        const endValue = props[prop];
        (element.style as any)[prop] = (startValue + (endValue - startValue) * eased) + "px";
      }
      if (progress < 1) requestAnimationFrame(animate);
      else if (callback) callback();
    };
    requestAnimationFrame(animate);
  }

  _playInternal(animation: string, callback: Function) {
    if (this._isIdleAnimation() && this._idlePromise) {
      this._idlePromise.then(() => this._playInternal(animation, callback));
      return;
    }
    this._animator.showAnimation(animation, callback);
  }

  play(animation: string, timeout?: number, cb?: Function) {
    if (!this.hasAnimation(animation)) return false;
    if (timeout === undefined) timeout = 5000;
    this._addToQueue(function (this: Agent, complete: Function) {
      let completed = false;
      let callback = (_name: string, state: number) => {
        if (state === Animator.States.EXITED) {
          completed = true;
          if (cb) cb();
          complete();
        }
      };
      if (timeout) {
        window.setTimeout(() => {
          if (completed) return;
          this._animator.exitAnimation();
        }, timeout);
      }
      this._playInternal(animation, callback);
    }, this);
    return true;
  }

  show(fast?: boolean) {
    this._hidden = false;
    const style = getComputedStyle(this._el);
    if (style.top === "auto" || style.left === "auto") {
      const [fw, fh] = this._animator._data.framesize as [number, number];
      let left = window.innerWidth - fw - 20;
      let top = window.innerHeight - fh - 20;
      let clamped = this._clampXY(left, top);
      this._el.style.top = clamped.y + "px";
      this._el.style.left = clamped.x + "px";
    }
    if (fast || !this.hasAnimation("Show")) {
      this._el.style.display = "block";
      this.resume();
      this._onQueueEmpty();
      return;
    }
    this.resume();
    return this.play("Show");
  }

  speak(text: string, options?: { hold?: boolean; tts?: boolean }) {
    this._addToQueue(function (this: Agent, complete: Function) {
      this._balloon.speak(complete as () => void, text, options?.hold);
      if (options?.tts) this._speakTTS(text);
    }, this);
  }

  async speakStream(source: AsyncIterable<string>, options?: { tts?: boolean }): Promise<string> {
    this.stop();
    let text = "";
    const stream = this._balloon.speakStream(() => this._onQueueEmpty());
    for await (const chunk of source) {
      text += chunk;
      stream.push(chunk);
    }
    if (options?.tts && text) this._speakTTS(text);
    stream.done();
    return text;
  }

  closeBalloon() {
    this._balloon.hide();
  }

  delay(time?: number) {
    time = time || 250;
    this._addToQueue(function (this: Agent, complete: Function) {
      this._onQueueEmpty();
      window.setTimeout(complete, time);
    });
  }

  stopCurrent() {
    this._animator.exitAnimation();
    this._balloon.close();
  }

  stop() {
    this._queue.clear();
    this._animator.exitAnimation();
    this._balloon.hide();
    if (this._tts && "speechSynthesis" in window) speechSynthesis.cancel();
  }

  hasAnimation(name: string) {
    return this._animator.hasAnimation(name);
  }

  animations() {
    return this._animator.animations();
  }

  animate(): boolean {
    let animations = this.animations();
    let anim = animations[Math.floor(Math.random() * animations.length)];
    if (anim.indexOf("Idle") === 0) return this.animate();
    return this.play(anim) as boolean;
  }

  _getDirection(x: number, y: number) {
    let rect = this._el.getBoundingClientRect();
    let h = this._el.offsetHeight;
    let w = this._el.offsetWidth;
    let centerX = rect.left + w / 2;
    let centerY = rect.top + h / 2;
    let a = centerY - y;
    let b = centerX - x;
    let r = Math.round((180 * Math.atan2(a, b)) / Math.PI);
    if (-45 <= r && r < 45) return "Right";
    if (45 <= r && r < 135) return "Up";
    if ((135 <= r && r <= 180) || (-180 <= r && r < -135)) return "Left";
    if (-135 <= r && r < -45) return "Down";
    return "Top";
  }

  _onQueueEmpty() {
    if (this._hidden || this._isIdleAnimation()) return;
    let idleAnim = this._getIdleAnimation();
    this._idlePromise = new Promise((resolve) => {
      this._idleResolve = resolve;
    });
    this._animator.showAnimation(idleAnim, this._onIdleComplete.bind(this));
  }

  _onIdleComplete(_name: string, state: number) {
    if (state === Animator.States.EXITED) {
      if (this._idleResolve) this._idleResolve();
      this._idlePromise = null;
      this._idleResolve = null;
    }
  }

  _isIdleAnimation() {
    let c = this._animator.currentAnimationName;
    return c && c.indexOf("Idle") === 0;
  }

  _getIdleAnimation() {
    let animations = this.animations();
    let r = animations.filter((a) => a.indexOf("Idle") === 0);
    return r[Math.floor(Math.random() * r.length)];
  }

  _setupEvents() {
    this._resizeHandle = this.reposition.bind(this);
    this._dblClickHandle = this._onDoubleClick.bind(this);
    window.addEventListener("resize", this._resizeHandle);
    this._el.addEventListener("mousedown", (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.pause();
      this._balloon.hide(true);
      lockClickthrough(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = this._el.offsetLeft;
      const startTop = this._el.offsetTop;

      const onMove = (e: MouseEvent) => {
        this._el.style.left = (startLeft + e.clientX - startX) + "px";
        this._el.style.top = (startTop + e.clientY - startY) + "px";
      };

      const onUp = () => {
        lockClickthrough(false);
        this._balloon.show();
        this.reposition();
        this.resume();
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
    this._el.addEventListener("dblclick", this._dblClickHandle);
  }

  _onDoubleClick() {
    if (!this.play("ClickedOn")) this.animate();
  }

  reposition() {
    const style = getComputedStyle(this._el);
    if (style.display === "none") return;
    let o = this._el.getBoundingClientRect();
    let bH = this._el.offsetHeight;
    let bW = this._el.offsetWidth;
    let wW = window.innerWidth;
    let wH = window.innerHeight;
    let top = o.top;
    let left = o.left;
    let m = 5;
    if (top - m < 0) top = m;
    else if (top + bH + m > wH) top = wH - bH - m;
    if (left - m < 0) left = m;
    else if (left + bW + m > wW) left = wW - bW - m;
    this._el.style.left = left + "px";
    this._el.style.top = top + "px";
    this._balloon.reposition();
  }

  _clampXY(x: number, y: number) {
    let m = 5;
    let bW = this._el.offsetWidth;
    let bH = this._el.offsetHeight;
    let wW = window.innerWidth;
    let wH = window.innerHeight;
    return {
      x: Math.max(m, Math.min(x, wW - bW - m)),
      y: Math.max(m, Math.min(y, wH - bH - m)),
    };
  }

  _addToQueue(func: Function, scope?: any) {
    if (scope) func = func.bind(scope);
    this._queue.queue(func);
  }

  _speakTTS(text: string) {
    if (!this._tts || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.split("\n").join(" "));
    utterance.rate = this._tts.rate;
    utterance.pitch = this._tts.pitch;
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      const match = voices.find((v) => v.name.includes(this._tts!.voice));
      if (match) utterance.voice = match;
      speechSynthesis.speak(utterance);
    } else {
      speechSynthesis.addEventListener("voiceschanged", () => {
        const v = speechSynthesis.getVoices();
        const match = v.find((voice) => voice.name.includes(this._tts!.voice));
        if (match) utterance.voice = match;
        speechSynthesis.speak(utterance);
      }, { once: true });
    }
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this._resizeHandle);
    this._animator.dispose();
    this._balloon.dispose();
    this._queue.dispose();
    this._el.remove();
  }

  pause() {
    this._animator.pause();
    this._balloon.pause();
  }

  resume() {
    this._animator.resume();
    this._balloon.resume();
  }
}

export async function initAgent(loaders: AgentLoaders, characterName?: string): Promise<Agent> {
  const [{ default: data }, { default: map }, sounds] = await Promise.all([
    loaders.agent(),
    loaders.map(),
    _loadSounds(loaders),
  ]);
  return new Agent(map, data, sounds, characterName);
}

async function _loadSounds(loaders: AgentLoaders): Promise<Record<string, string>> {
  const audio = document.createElement("audio");
  const canPlayMp3 = !!audio.canPlayType && audio.canPlayType("audio/mp3") !== "";
  if (!canPlayMp3) return {};
  const m = await loaders.sound();
  return m.default;
}
