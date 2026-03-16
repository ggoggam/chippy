import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";

export interface BalloonHandle {
  speak(complete: () => void, text: string, hold?: boolean): void;
  speakStream(complete: () => void): {
    push: (chunk: string) => void;
    done: () => void;
  };
  show(): void;
  hide(fast?: boolean): void;
  close(): void;
  pause(): void;
  resume(): void;
  reposition(): void;
  enableInput(onSubmit: (text: string) => void): void;
  focusInput(): void;
  addMessage(role: "user" | "assistant", text: string): void;
  streamMessage(): {
    push: (chunk: string) => void;
    done: () => void;
    getText: () => string;
  };
  dispose(): void;
}

interface BalloonProps {
  targetEl: HTMLElement | null;
  characterName?: string;
}


const WORD_SPEAK_TIME = 200;
const CLOSE_BALLOON_DELAY = 5000;
const BALLOON_MARGIN = 15;

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const Balloon = forwardRef<BalloonHandle, BalloonProps>(function Balloon(
  { targetEl, characterName = "Clippy" },
  ref,
) {
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [visible, setVisible] = useState(false);
  // Anchored by bottom-right so balloon grows upward/leftward as content expands
  const [anchor, setAnchor] = useState({ bottom: -9999, right: -9999 });
  const [speakContent, setSpeakContent] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputEnabled, setInputEnabled] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Imperative state kept in refs to avoid stale closures
  const hiddenRef = useRef(true);
  const activeRef = useRef(false);
  const holdRef = useRef(false);
  const hidingRef = useRef<number | null>(null);
  const loopRef = useRef<number | undefined>(undefined);
  const addWordRef = useRef<(() => void) | undefined>(undefined);
  const completeRef = useRef<() => void>(() => {});
  const onSubmitRef = useRef<((text: string) => void) | null>(null);
  const msgIdRef = useRef(0);

  // Anchor the balloon's bottom-right corner to the character's top-right area.
  // As content grows the balloon expands upward and leftward — anchor stays fixed.
  const reposition = useCallback(() => {
    if (!targetEl) return;
    const o = targetEl.getBoundingClientRect();
    setAnchor({
      bottom: window.innerHeight - (o.top - BALLOON_MARGIN),
      right: window.innerWidth - (o.left + o.width),
    });
  }, [targetEl]);

  const finishHideBalloon = useCallback(() => {
    if (activeRef.current) return;
    if (onSubmitRef.current) return;
    setVisible(false);
    hiddenRef.current = true;
    hidingRef.current = null;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      reposition,

      show() {
        if (hiddenRef.current) return;
        setVisible(true);
      },

      hide(fast?: boolean) {
        if (hidingRef.current) {
          window.clearTimeout(hidingRef.current);
          hidingRef.current = null;
        }
        if (fast) {
          setVisible(false);
          return;
        }
        hidingRef.current = window.setTimeout(
          finishHideBalloon,
          CLOSE_BALLOON_DELAY,
        );
      },

      speak(complete: () => void, text: string, hold?: boolean) {
        if (hidingRef.current) {
          window.clearTimeout(hidingRef.current);
          hidingRef.current = null;
        }
        hiddenRef.current = false;
        activeRef.current = true;
        holdRef.current = hold ?? false;
        completeRef.current = complete;
        reposition();
        setVisible(true);
        setSpeakContent("");

        const words = text.split(/( +|\n)/);
        let idx = 1;
        addWordRef.current = function addWord() {
          if (!activeRef.current) return;
          if (idx > words.length) {
            addWordRef.current = undefined;
            activeRef.current = false;
            if (!holdRef.current) {
              complete();
              hidingRef.current = window.setTimeout(
                finishHideBalloon,
                CLOSE_BALLOON_DELAY,
              );
            }
          } else {
            setSpeakContent(words.slice(0, idx).join(""));
            idx += 2;
            loopRef.current = window.setTimeout(
              addWordRef.current!,
              WORD_SPEAK_TIME,
            );
          }
        };
        addWordRef.current();
      },

      speakStream(complete: () => void) {
        if (hidingRef.current) {
          window.clearTimeout(hidingRef.current);
          hidingRef.current = null;
        }
        hiddenRef.current = false;
        activeRef.current = true;
        holdRef.current = true;
        completeRef.current = complete;
        reposition();
        setVisible(true);
        setSpeakContent("");

        let text = "";
        let dots = 0;
        const loadingInterval = window.setInterval(() => {
          dots = (dots % 3) + 1;
          setSpeakContent(".".repeat(dots));
        }, 400);

        return {
          push: (chunk: string) => {
            if (!text) window.clearInterval(loadingInterval);
            text += chunk;
            setSpeakContent(text);
          },
          done: () => {
            window.clearInterval(loadingInterval);
            activeRef.current = false;
            holdRef.current = false;
            complete();
          },
        };
      },

      close() {
        if (activeRef.current) {
          holdRef.current = false;
        } else if (holdRef.current) {
          completeRef.current();
        }
      },

      pause() {
        window.clearTimeout(loopRef.current);
        if (hidingRef.current) {
          window.clearTimeout(hidingRef.current);
          hidingRef.current = null;
        }
      },

      resume() {
        if (addWordRef.current) {
          addWordRef.current();
        } else if (!holdRef.current && !hiddenRef.current) {
          hidingRef.current = window.setTimeout(
            finishHideBalloon,
            CLOSE_BALLOON_DELAY,
          );
        }
      },

      enableInput(onSubmit: (text: string) => void) {
        onSubmitRef.current = onSubmit;
        setInputEnabled(true);
        hiddenRef.current = false;
        reposition();
        setVisible(true);
      },

      focusInput() {
        inputRef.current?.focus();
      },

      addMessage(role: "user" | "assistant", text: string) {
        setMessages((prev) => [
          ...prev,
          { id: msgIdRef.current++, role, text },
        ]);
      },

      streamMessage() {
        const id = msgIdRef.current++;
        setMessages((prev) => [...prev, { id, role: "assistant", text: "" }]);
        let text = "";
        return {
          push: (chunk: string) => {
            text += chunk;
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, text } : m)),
            );
          },
          done: () => {},
          getText: () => text,
        };
      },

      dispose() {
        window.clearTimeout(loopRef.current);
        if (hidingRef.current) {
          window.clearTimeout(hidingRef.current);
          hidingRef.current = null;
        }
        activeRef.current = false;
        addWordRef.current = undefined;
      },
    }),
    [reposition, finishHideBalloon],
  );

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [messages]);

  const submitInput = useCallback(() => {
    const text = inputValue.trim();
    if (!text || !onSubmitRef.current) return;
    setInputValue("");
    onSubmitRef.current(text);
  }, [inputValue]);


  return createPortal(
    <div
      data-interactive
      style={{
        position: "fixed",
        zIndex: 10001,
        cursor: "pointer",
        background: "#ffc",
        color: "black",
        padding: "8px",
        border: "1px solid black",
        borderRadius: "5px",
        display: visible ? "block" : "none",
        maxWidth: inputEnabled ? "none" : "230px",
        width: inputEnabled ? "230px" : undefined,
        bottom: anchor.bottom,
        right: anchor.right,
      }}
    >
      <svg
        style={{
          position: "absolute",
          top: "calc(100% - 1px)",
          right: "10px",
          display: "block",
          overflow: "visible",
        }}
        width="20"
        height="16"
        viewBox="0 0 20 16"
      >
        <polygon points="0,0 14,0 3,16" fill="#ffc" stroke="black" strokeWidth="1" />
        <line x1="-1" y1="0" x2="15" y2="0" stroke="#ffc" strokeWidth="3" />
      </svg>

      {!inputEnabled && (
        <div
          style={{
            maxWidth: "200px",
            minWidth: "120px",
            fontFamily: '"Microsoft Sans Serif", sans-serif',
            fontSize: "10pt",
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
            overflowWrap: "break-word",
          }}
        >
          {speakContent}
        </div>
      )}

      {inputEnabled && (
        <>
          <div
            ref={historyRef}
            style={{
              display: "flex",
              flexDirection: "column",
              maxHeight: "500px",
              overflowY: "auto",
              padding: "4px 0 2px",
              fontFamily: '"Microsoft Sans Serif", sans-serif',
              fontSize: "10px",
              lineHeight: "1.4",
            }}
          >
            {messages.map((msg) => (
              <div key={msg.id}>
                <b
                  style={{ color: msg.role === "user" ? "#000080" : "#006400" }}
                >
                  {msg.role === "user" ? "You: " : `${characterName}: `}
                </b>
                {msg.text}
              </div>
            ))}
          </div>
          <div
            style={{ borderTop: "1px solid #888", margin: "4px -8px 2px" }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              paddingTop: "4px",
            }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask me something..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitInput();
                if (e.key === "Escape") inputRef.current?.blur();
              }}
              style={{
                flex: "1",
                minWidth: "0",
                fontFamily: '"Microsoft Sans Serif", sans-serif',
                fontSize: "10px",
                border: "1px inset #888",
                background: "#fff",
                padding: "2px 4px",
                outline: "none",
              }}
            />
            <button
              style={{
                fontFamily: '"Microsoft Sans Serif", sans-serif',
                fontSize: "10px",
                background: "#d4d0c8",
                border: "2px solid",
                borderColor: "#ffffff #808080 #808080 #ffffff",
                padding: "1px 5px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={submitInput}
            >
              OK
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
});

export default Balloon;
