export default class Animator {
  _el: HTMLElement;
  _data: any;
  _mapUrl: string;
  _currentFrameIndex: number;
  _currentFrame: any;
  _exiting: boolean;
  _currentAnimation: any;
  _endCallback: Function | undefined;
  _started: boolean;
  _sounds: { [key: string]: HTMLAudioElement };
  currentAnimationName: string | undefined;
  _overlays: HTMLElement[];
  _loop: number | undefined;
  static States: { WAITING: number; EXITED: number };

  constructor(el: HTMLElement, mapUrl: string, data: any, sounds: any) {
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
      let inner = this._setupElement(document.createElement("div"));
      curr.appendChild(inner);
      this._overlays.push(inner);
      curr = inner;
    }
  }

  _setupElement(el: HTMLElement) {
    let frameSize = this._data.framesize;
    el.style.display = "none";
    el.style.width = frameSize[0] + "px";
    el.style.height = frameSize[1] + "px";
    el.style.background = "url('" + this._mapUrl + "') no-repeat";
    return el;
  }

  animations(): string[] {
    let r: string[] = [];
    let d = this._data.animations;
    for (let n in d) r.push(n);
    return r;
  }

  preloadSounds(sounds: Record<string, string>) {
    for (let i = 0; i < this._data.sounds.length; i++) {
      let snd = this._data.sounds[i];
      let uri = sounds[snd];
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

  showAnimation(animationName: string, stateChangeCallback: Function) {
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
        let xy = images[i];
        let bg = -xy[0] + "px " + -xy[1] + "px";
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
    let currentFrame = this._currentFrame;
    let branching = this._currentFrame.branching;
    if (this._exiting && currentFrame.exitBranch !== undefined) {
      return currentFrame.exitBranch;
    } else if (branching) {
      let rnd = Math.random() * 100;
      for (let i = 0; i < branching.branches.length; i++) {
        let branch = branching.branches[i];
        if (rnd <= branch.weight) return branch.frameIndex;
        rnd -= branch.weight;
      }
    }
    return this._currentFrameIndex + 1;
  }

  _playSound() {
    let s = this._currentFrame?.sound;
    if (!s) return;
    let audio = this._sounds[s];
    if (audio) audio.play().catch(() => {});
  }

  _atLastFrame() {
    return this._currentFrameIndex >= this._currentAnimation.frames.length - 1;
  }

  _step() {
    if (!this._currentAnimation) return;
    let newFrameIndex = Math.min(
      this._getNextAnimationFrame(),
      this._currentAnimation.frames.length - 1
    );
    let frameChanged = !this._currentFrame || this._currentFrameIndex !== newFrameIndex;
    this._currentFrameIndex = newFrameIndex;
    if (!(this._atLastFrame() && this._currentAnimation.useExitBranching)) {
      this._currentFrame = this._currentAnimation.frames[this._currentFrameIndex];
    }
    this._draw();
    this._playSound();
    this._loop = window.setTimeout(this._step.bind(this), this._currentFrame.duration);
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
