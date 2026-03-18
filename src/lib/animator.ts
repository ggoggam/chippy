export type AnimatorCallback = (animationName: string | undefined, state: number) => void;

export interface AnimatorData {
  overlayCount: number;
  framesize: number[];
  sounds: string[];
  animations: Record<string, AnimationDef>;
  tts?: { rate: number; pitch: number; voice: string };
}

interface AnimationBranch {
  weight: number;
  frameIndex: number;
}

interface AnimationFrame {
  images?: number[][];
  sound?: string;
  duration: number;
  exitBranch?: number;
  branching?: { branches: AnimationBranch[] };
}

interface AnimationDef {
  frames: AnimationFrame[];
  useExitBranching?: boolean;
}

export default class Animator {
  _el: HTMLElement;
  _data: AnimatorData;
  _mapUrl: string;
  _currentFrameIndex: number;
  _currentFrame: AnimationFrame | undefined;
  _exiting: boolean;
  _currentAnimation: AnimationDef | undefined;
  _endCallback: AnimatorCallback | undefined;
  _started: boolean;
  _sounds: { [key: string]: HTMLAudioElement };
  currentAnimationName: string | undefined;
  _overlays: HTMLElement[];
  _loop: number | undefined;
  static States: { WAITING: number; EXITED: number };

  constructor(el: HTMLElement, mapUrl: string, data: AnimatorData, sounds: Record<string, string>) {
    this._el = el;
    this._data = data;
    this._mapUrl = mapUrl;
    this._currentFrameIndex = 0;
    this._currentFrame = undefined;
    this._exiting = false;
    this._currentAnimation = undefined;
    this._endCallback = undefined;
    this._started = false;
    this._sounds = {};
    this.currentAnimationName = undefined;
    this.preloadSounds(sounds);
    this._overlays = [this._el];
    let curr = this._el;
    this._setupElement(this._el);
    for (let i = 1; i < this._data.overlayCount; i++) {
      const inner = this._setupElement(document.createElement("div"));
      curr.appendChild(inner);
      this._overlays.push(inner);
      curr = inner;
    }
  }

  _setupElement(el: HTMLElement) {
    const frameSize = this._data.framesize;
    el.style.display = "none";
    el.style.width = frameSize[0] + "px";
    el.style.height = frameSize[1] + "px";
    el.style.background = "url('" + this._mapUrl + "') no-repeat";
    return el;
  }

  animations(): string[] {
    const r: string[] = [];
    const d = this._data.animations;
    for (const n in d) r.push(n);
    return r;
  }

  preloadSounds(sounds: Record<string, string>) {
    for (let i = 0; i < this._data.sounds.length; i++) {
      const snd = this._data.sounds[i];
      const uri = sounds[snd];
      if (!uri) continue;
      this._sounds[snd] = new Audio(uri);
    }
  }

  hasAnimation(name: string) {
    return !!this._data.animations[name];
  }

  exitAnimation() {
    this._exiting = true;
  }

  showAnimation(animationName: string, stateChangeCallback: AnimatorCallback) {
    this._exiting = false;
    if (!this.hasAnimation(animationName)) return false;
    this._currentAnimation = this._data.animations[animationName];
    this.currentAnimationName = animationName;
    if (!this._started) {
      this._step();
      this._started = true;
    }
    this._currentFrameIndex = 0;
    this._currentFrame = undefined;
    this._endCallback = stateChangeCallback;
    return true;
  }

  _draw() {
    let images: number[][] = [];
    if (this._currentFrame) images = this._currentFrame.images || [];
    for (let i = 0; i < this._overlays.length; i++) {
      if (i < images.length) {
        const xy = images[i];
        const bg = -xy[0] + "px " + -xy[1] + "px";
        this._overlays[i].style.backgroundPosition = bg;
        this._overlays[i].style.display = "block";
      } else {
        this._overlays[i].style.display = "none";
      }
    }
  }

  _getNextAnimationFrame(): number {
    if (!this._currentAnimation) return 0;
    if (!this._currentFrame) return 0;
    const currentFrame = this._currentFrame;
    const branching = this._currentFrame.branching;
    if (this._exiting && currentFrame.exitBranch !== undefined) {
      return currentFrame.exitBranch;
    } else if (branching) {
      let rnd = Math.random() * 100;
      for (let i = 0; i < branching.branches.length; i++) {
        const branch = branching.branches[i];
        if (rnd <= branch.weight) return branch.frameIndex;
        rnd -= branch.weight;
      }
    }
    return this._currentFrameIndex + 1;
  }

  _playSound() {
    const s = this._currentFrame?.sound;
    if (!s) return;
    const audio = this._sounds[s];
    if (audio) audio.play().catch(() => {});
  }

  _atLastFrame() {
    return this._currentFrameIndex >= (this._currentAnimation?.frames.length ?? 0) - 1;
  }

  _step() {
    if (!this._currentAnimation) return;
    const newFrameIndex = Math.min(
      this._getNextAnimationFrame(),
      this._currentAnimation.frames.length - 1
    );
    const frameChanged = !this._currentFrame || this._currentFrameIndex !== newFrameIndex;
    this._currentFrameIndex = newFrameIndex;
    if (!(this._atLastFrame() && this._currentAnimation.useExitBranching)) {
      this._currentFrame = this._currentAnimation.frames[this._currentFrameIndex];
    }
    this._draw();
    this._playSound();
    this._loop = window.setTimeout(this._step.bind(this), this._currentFrame?.duration ?? 100);
    if (this._endCallback && frameChanged && this._atLastFrame()) {
      if (this._currentAnimation.useExitBranching && !this._exiting) {
        this._endCallback(this.currentAnimationName, Animator.States.WAITING);
      } else {
        this._endCallback(this.currentAnimationName, Animator.States.EXITED);
      }
    }
  }

  pause() {
    window.clearTimeout(this._loop);
  }

  resume() {
    this._step();
  }

  dispose() {
    window.clearTimeout(this._loop);
    this._currentAnimation = undefined;
    this._currentFrame = undefined;
    this._endCallback = undefined;
    this._started = false;
    for (const key in this._sounds) {
      this._sounds[key].pause();
      this._sounds[key].src = "";
    }
    this._sounds = {};
  }
}

Animator.States = { WAITING: 1, EXITED: 0 };
