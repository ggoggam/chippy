import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import Animator, { type AnimatorData, type AnimatorCallback } from "../lib/animator";
import BalloonComponent, { type BalloonHandle, type Message } from "./balloon";
import Queue, { type QueueCallback } from "../lib/queue";
import { lockClickthrough } from "../lib/clickthrough";

export interface AgentLoaders {
  agent: () => Promise<{ default: AnimatorData }>;
  sound: () => Promise<{ default: Record<string, string> }>;
  map: () => Promise<{ default: string }>;
}

export interface AgentHandle {
  show(fast?: boolean): void;
  hide(fast?: boolean, callback?: () => void): void;
  play(animation: string, timeout?: number, cb?: () => void): boolean;
  speak(text: string, options?: { hold?: boolean; tts?: boolean }): void;
  speakStream(
    source: AsyncIterable<string>,
    options?: { tts?: boolean },
  ): Promise<string>;
  closeBalloon(): void;
  moveTo(x: number, y: number, duration?: number): void;
  gestureAt(x: number, y: number): void;
  delay(time?: number): void;
  stopCurrent(): void;
  stop(): void;
  hasAnimation(name: string): boolean;
  animations(): string[];
  animate(): boolean;
  dispose(): void;
  pause(): void;
  resume(): void;
  enableInput(onSubmit: (text: string, images: string[]) => void): void;
  focusInput(): void;
  addMessage(role: "user" | "assistant", text: string, images?: string[]): void;
  getMessages(): Message[];
  setMessages(msgs: Message[]): void;
  clearMessages(): void;
  streamMessage(): {
    push: (chunk: string) => void;
    done: () => void;
    getText: () => string;
  };
  exitAnimation(): void;
  getElement(): HTMLElement | null;
}

interface AgentProps {
  mapUrl: string;
  data: AnimatorData;
  sounds: Record<string, string>;
  characterName?: string;
  onReady?: () => void;
}

export async function loadAgentData(loaders: AgentLoaders) {
  const audio = document.createElement("audio");
  const canPlayMp3 =
    !!audio.canPlayType && audio.canPlayType("audio/mp3") !== "";
  const [{ default: data }, { default: mapUrl }, soundModule] =
    await Promise.all([
      loaders.agent(),
      loaders.map(),
      canPlayMp3
        ? loaders.sound()
        : Promise.resolve({ default: {} }),
    ]);
  return {
    data,
    mapUrl,
    sounds: soundModule.default as Record<string, string>,
  };
}

function animateElement(
  element: HTMLElement,
  props: Record<string, number>,
  duration: number,
  callback?: () => void,
) {
  const start = performance.now();
  const startProps: Record<string, number> = {};
  for (const prop in props) {
    startProps[prop] =
      parseFloat((getComputedStyle(element) as CSSStyleDeclaration & Record<string, string>)[prop]) || 0;
  }
  const swing = (p: number) => 0.5 - Math.cos(p * Math.PI) / 2;
  const step = (currentTime: number) => {
    const elapsed = currentTime - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = swing(progress);
    for (const prop in props) {
      const sv = startProps[prop];
      const ev = props[prop];
      (element.style as CSSStyleDeclaration & Record<string, string>)[prop] = sv + (ev - sv) * eased + "px";
    }
    if (progress < 1) requestAnimationFrame(step);
    else if (callback) callback();
  };
  requestAnimationFrame(step);
}

const AgentComponent = forwardRef<AgentHandle, AgentProps>(
  function AgentComponent(
    { mapUrl, data, sounds, characterName, onReady },
    ref,
  ) {
    const elRef = useRef<HTMLDivElement>(null);
    const animatorRef = useRef<Animator | null>(null);
    const balloonRef = useRef<BalloonHandle>(null);
    const queueRef = useRef<Queue | null>(null);
    const hiddenRef = useRef(true);
    const idlePromiseRef = useRef<Promise<void> | null>(null);
    const idleResolveRef = useRef<(() => void) | null>(null);
    const ttsRef = useRef<
      { rate: number; pitch: number; voice: string } | undefined
    >(data.tts);
    const [ready, setReady] = useState(false);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;

    function isIdleAnimation() {
      const c = animatorRef.current?.currentAnimationName;
      return c != null && c.indexOf("Idle") === 0;
    }

    function getIdleAnimation() {
      const anims = animatorRef.current!.animations();
      const idles = anims.filter((a) => a.indexOf("Idle") === 0);
      return idles[Math.floor(Math.random() * idles.length)];
    }

    function onIdleComplete(_name: string | undefined, state: number) {
      if (state === Animator.States.EXITED) {
        if (idleResolveRef.current) idleResolveRef.current();
        idlePromiseRef.current = null;
        idleResolveRef.current = null;
      }
    }

    function onQueueEmpty() {
      if (hiddenRef.current || isIdleAnimation()) return;
      const idleAnim = getIdleAnimation();
      idlePromiseRef.current = new Promise((resolve) => {
        idleResolveRef.current = resolve;
      });
      animatorRef.current!.showAnimation(idleAnim, onIdleComplete);
    }

    function playInternal(animation: string, callback: AnimatorCallback) {
      if (isIdleAnimation() && idlePromiseRef.current) {
        idlePromiseRef.current.then(() =>
          playInternal(animation, callback),
        );
        return;
      }
      animatorRef.current!.showAnimation(animation, callback);
    }

    function addToQueue(func: QueueCallback) {
      queueRef.current?.queue(func);
    }

    function clampXY(x: number, y: number) {
      const el = elRef.current;
      if (!el) return { x, y };
      const m = 5;
      const bW = el.offsetWidth;
      const bH = el.offsetHeight;
      const wW = window.innerWidth;
      const wH = window.innerHeight;
      return {
        x: Math.max(m, Math.min(x, wW - bW - m)),
        y: Math.max(m, Math.min(y, wH - bH - m)),
      };
    }

    function getDirection(x: number, y: number) {
      const el = elRef.current;
      if (!el) return "Right";
      const rect = el.getBoundingClientRect();
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const centerX = rect.left + w / 2;
      const centerY = rect.top + h / 2;
      const a = centerY - y;
      const b = centerX - x;
      const r = Math.round((180 * Math.atan2(a, b)) / Math.PI);
      if (-45 <= r && r < 45) return "Right";
      if (45 <= r && r < 135) return "Up";
      if ((135 <= r && r <= 180) || (-180 <= r && r < -135))
        return "Left";
      if (-135 <= r && r < -45) return "Down";
      return "Top";
    }

    function reposition() {
      const el = elRef.current;
      if (!el) return;
      const style = getComputedStyle(el);
      if (style.display === "none") return;
      const o = el.getBoundingClientRect();
      const bH = el.offsetHeight;
      const bW = el.offsetWidth;
      const wW = window.innerWidth;
      const wH = window.innerHeight;
      let top = o.top;
      let left = o.left;
      const m = 5;
      if (top - m < 0) top = m;
      else if (top + bH + m > wH) top = wH - bH - m;
      if (left - m < 0) left = m;
      else if (left + bW + m > wW) left = wW - bW - m;
      el.style.left = left + "px";
      el.style.top = top + "px";
      balloonRef.current?.reposition();
    }

    function speakTTS(text: string) {
      const tts = ttsRef.current;
      if (!tts || !("speechSynthesis" in window)) return;
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        text.split("\n").join(" "),
      );
      utterance.rate = tts.rate;
      utterance.pitch = tts.pitch;
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        const match = voices.find((v) => v.name.includes(tts.voice));
        if (match) utterance.voice = match;
        speechSynthesis.speak(utterance);
      } else {
        speechSynthesis.addEventListener(
          "voiceschanged",
          () => {
            const v = speechSynthesis.getVoices();
            const match = v.find((voice) =>
              voice.name.includes(tts.voice),
            );
            if (match) utterance.voice = match;
            speechSynthesis.speak(utterance);
          },
          { once: true },
        );
      }
    }

    // Set up imperative handle before the layout effect so the ref is
    // available to the parent once the initialization effect calls setReady.
    useImperativeHandle(
      ref,
      () => {
        const el = elRef.current;

        function show(fast?: boolean) {
          if (!el || !animatorRef.current) return;
          hiddenRef.current = false;
          const style = getComputedStyle(el);
          if (style.top === "auto" || style.left === "auto") {
            const saved = localStorage.getItem("agent-position");
            let left: number, top: number;
            if (saved) {
              const pos = JSON.parse(saved);
              left = pos.left;
              top = pos.top;
            } else {
              const [fw, fh] = data.framesize as [number, number];
              left = window.innerWidth - fw - 20;
              top = window.innerHeight - fh - 20;
            }
            const clamped = clampXY(left, top);
            el.style.top = clamped.y + "px";
            el.style.left = clamped.x + "px";
          }
          if (fast || !animatorRef.current.hasAnimation("Show")) {
            el.style.display = "block";
            animatorRef.current.resume();
            balloonRef.current?.resume();
            onQueueEmpty();
            return;
          }
          animatorRef.current.resume();
          balloonRef.current?.resume();
          play("Show", undefined, () => balloonRef.current?.reposition());
        }

        function hide(fast?: boolean, callback?: () => void) {
          if (!el) return;
          hiddenRef.current = true;
          stop();
          if (fast) {
            el.style.display = "none";
            pause();
            if (callback) callback();
            return;
          }
          playInternal("Hide", function (_name: string | undefined, state: number) {
            if (state === Animator.States.EXITED) {
              el.style.display = "none";
              if (callback) callback();
            }
          });
        }

        function play(
          animation: string,
          timeout?: number,
          cb?: () => void,
        ): boolean {
          if (!animatorRef.current?.hasAnimation(animation)) return false;
          if (timeout === undefined) timeout = 5000;
          addToQueue(function (complete: () => void) {
            let completed = false;
            const callback = (_name: string | undefined, state: number) => {
              if (state === Animator.States.EXITED) {
                completed = true;
                if (cb) cb();
                complete();
              }
            };
            if (timeout) {
              window.setTimeout(() => {
                if (completed) return;
                animatorRef.current?.exitAnimation();
              }, timeout);
            }
            playInternal(animation, callback);
          });
          return true;
        }

        function speak(
          text: string,
          options?: { hold?: boolean; tts?: boolean },
        ) {
          addToQueue(function (complete: () => void) {
            balloonRef.current?.speak(
              complete,
              text,
              options?.hold,
            );
            if (options?.tts) speakTTS(text);
          });
        }

        async function speakStream(
          source: AsyncIterable<string>,
          options?: { tts?: boolean },
        ): Promise<string> {
          stop();
          let text = "";
          const stream = balloonRef.current!.speakStream(
            () => onQueueEmpty(),
          );
          for await (const chunk of source) {
            text += chunk;
            stream.push(chunk);
          }
          if (options?.tts && text) speakTTS(text);
          stream.done();
          return text;
        }

        function moveTo(x: number, y: number, duration?: number) {
          if (!el) return;
          const dir = getDirection(x, y);
          const anim = "Move" + dir;
          if (duration === undefined) duration = 1000;
          addToQueue(function (complete: () => void) {
            const clamped = clampXY(x, y);
            const cx = clamped.x;
            const cy = clamped.y;
            if (duration === 0) {
              el.style.top = cy + "px";
              el.style.left = cx + "px";
              reposition();
              complete();
              return;
            }
            if (!animatorRef.current?.hasAnimation(anim)) {
              animateElement(
                el,
                { top: cy, left: cx },
                duration!,
                complete,
              );
              return;
            }
            const callback = (_name: string | undefined, state: number) => {
              if (state === Animator.States.EXITED) complete();
              if (state === Animator.States.WAITING) {
                animateElement(
                  el,
                  { top: cy, left: cx },
                  duration!,
                  () => {
                    animatorRef.current?.exitAnimation();
                  },
                );
              }
            };
            playInternal(anim, callback);
          });
        }

        function gestureAt(x: number, y: number) {
          const d = getDirection(x, y);
          const gAnim = "Gesture" + d;
          const lookAnim = "Look" + d;
          const animation = animatorRef.current?.hasAnimation(gAnim)
            ? gAnim
            : lookAnim;
          return play(animation);
        }

        function delay(time?: number) {
          time = time || 250;
          addToQueue(function (complete: () => void) {
            onQueueEmpty();
            window.setTimeout(complete, time);
          });
        }

        function stopCurrent() {
          animatorRef.current?.exitAnimation();
          balloonRef.current?.close();
        }

        function stop() {
          queueRef.current?.clear();
          animatorRef.current?.exitAnimation();
          balloonRef.current?.hide();
          if (ttsRef.current && "speechSynthesis" in window)
            speechSynthesis.cancel();
        }

        function hasAnimation(name: string) {
          return animatorRef.current?.hasAnimation(name) ?? false;
        }

        function animations() {
          return animatorRef.current?.animations() ?? [];
        }

        function animate(): boolean {
          const anims = animations();
          const anim = anims[Math.floor(Math.random() * anims.length)];
          if (anim.indexOf("Idle") === 0) return animate();
          return play(anim);
        }

        function dispose() {
          stop();
        }

        function pause() {
          animatorRef.current?.pause();
          balloonRef.current?.pause();
        }

        function resume() {
          animatorRef.current?.resume();
          balloonRef.current?.resume();
        }

        return {
          show,
          hide,
          play,
          speak,
          speakStream,
          closeBalloon: () => balloonRef.current?.hide(),
          moveTo,
          gestureAt,
          delay,
          stopCurrent,
          stop,
          hasAnimation,
          animations,
          animate,
          dispose,
          pause,
          resume,
          enableInput: (onSubmit: (text: string, images: string[]) => void) =>
            balloonRef.current?.enableInput(onSubmit),
          focusInput: () => balloonRef.current?.focusInput(),
          addMessage: (role: "user" | "assistant", text: string, images?: string[]) =>
            balloonRef.current?.addMessage(role, text, images),
          getMessages: () => balloonRef.current?.getMessages() ?? [],
          setMessages: (msgs: Message[]) => balloonRef.current?.setMessages(msgs),
          clearMessages: () => balloonRef.current?.clearMessages(),
          streamMessage: () => balloonRef.current!.streamMessage(),
          exitAnimation: () => animatorRef.current?.exitAnimation(),
          getElement: () => elRef.current,
        };
      },
      [ready, data],
    );

    // Initialize Animator, Queue, and DOM events.
    useLayoutEffect(() => {
      const el = elRef.current;
      if (!el) return;

      const animator = new Animator(el, mapUrl, data, sounds);
      animatorRef.current = animator;
      queueRef.current = new Queue(onQueueEmpty);

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        animator.pause();
        balloonRef.current?.pause();
        balloonRef.current?.hide(true);
        lockClickthrough(true);

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = el.offsetLeft;
        const startTop = el.offsetTop;

        const onMove = (ev: MouseEvent) => {
          el.style.left = startLeft + ev.clientX - startX + "px";
          el.style.top = startTop + ev.clientY - startY + "px";
        };

        const onUp = () => {
          lockClickthrough(false);
          balloonRef.current?.show();
          reposition();
          animator.resume();
          balloonRef.current?.resume();
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          localStorage.setItem(
            "agent-position",
            JSON.stringify({ top: el.offsetTop, left: el.offsetLeft }),
          );
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      };

      const onDblClick = () => {
        if (animator.hasAnimation("ClickedOn")) {
          addToQueue(function (complete: () => void) {
            let completed = false;
            const cb: AnimatorCallback = (_name, state) => {
              if (state === Animator.States.EXITED) {
                completed = true;
                complete();
              }
            };
            window.setTimeout(() => {
              if (!completed) animator.exitAnimation();
            }, 5000);
            playInternal("ClickedOn", cb);
          });
        } else {
          const anims = animator.animations();
          let anim = anims[Math.floor(Math.random() * anims.length)];
          if (anim.indexOf("Idle") === 0)
            anim = anims[Math.floor(Math.random() * anims.length)];
          addToQueue(function (complete: () => void) {
            let completed = false;
            const cb: AnimatorCallback = (_name, state) => {
              if (state === Animator.States.EXITED) {
                completed = true;
                complete();
              }
            };
            window.setTimeout(() => {
              if (!completed) animator.exitAnimation();
            }, 5000);
            playInternal(anim, cb);
          });
        }
      };

      el.addEventListener("mousedown", onMouseDown);
      el.addEventListener("dblclick", onDblClick);
      window.addEventListener("resize", reposition);

      setReady(true);

      return () => {
        animator.dispose();
        queueRef.current?.dispose();
        el.removeEventListener("mousedown", onMouseDown);
        el.removeEventListener("dblclick", onDblClick);
        window.removeEventListener("resize", reposition);
        animatorRef.current = null;
        queueRef.current = null;
      };
    }, [mapUrl, data, sounds]);

    // Notify parent when fully initialized (Animator + Balloon ready).
    // This fires as a regular useEffect, guaranteeing all layout effects
    // (including BalloonComponent's useImperativeHandle) have completed.
    useEffect(() => {
      if (ready) onReadyRef.current?.();
    }, [ready]);

    return createPortal(
      <>
        <div
          ref={elRef}
          data-interactive
          style={{
            position: "fixed",
            zIndex: 10001,
            cursor: "pointer",
            display: "none",
            touchAction: "none",
          }}
        />
        {ready && (
          <BalloonComponent
            ref={balloonRef}
            targetEl={elRef.current}
            characterName={characterName}
          />
        )}
      </>,
      document.body,
    );
  },
);

export default AgentComponent;
