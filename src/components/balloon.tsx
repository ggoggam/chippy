import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useCallback,
  type DragEvent,
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
  dispose(): void;
}

interface BalloonProps {
  targetEl: HTMLElement | null;
  characterName?: string;
}

const WORD_SPEAK_TIME = 200;
const CLOSE_BALLOON_DELAY = 5000;
const BALLOON_MARGIN = 15;

export interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  images?: string[];
}

const WIN98_FONT = "font-[Tahoma,Microsoft_Sans_Serif,sans-serif] text-[11px]";

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div
      className="my-1 border border-[#808080] shadow-[inset_1px_1px_0_#404040] cursor-pointer relative group"
      onClick={handleClick}
      title="Click to copy"
    >
      {lang && (
        <div className="bg-[#000080] text-[#c0c0c0] text-[9px] font-[Tahoma,sans-serif] px-1.5 py-[1px] border-b border-[#808080]">
          {lang}
        </div>
      )}
      <pre className="bg-[#012] text-[#33ff33] font-[Fixedsys,Terminal,'Courier_New',monospace] text-[11px] leading-[1.3] p-1.5 m-0 overflow-x-auto whitespace-pre-wrap break-words win95-scrollbar">
        {code}
      </pre>
      {copied && (
        <div className="absolute top-1 right-1 bg-[#000080] text-white text-[9px] font-[Tahoma,sans-serif] px-1.5 py-[1px] border border-[#c0c0c0]">
          Copied!
        </div>
      )}
    </div>
  );
}

function renderMessageText(text: string) {
  // Split on fenced code blocks first, then handle inline code
  const parts: React.ReactNode[] = [];
  const fencedRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencedRegex.exec(text)) !== null) {
    // Text before the code block
    if (match.index > lastIndex) {
      parts.push(
        ...renderInlineCode(text.slice(lastIndex, match.index), parts.length),
      );
    }
    // Fenced code block — old terminal style
    const code = match[2].replace(/\n$/, "");
    parts.push(
      <CodeBlock key={`code-${parts.length}`} lang={match[1]} code={code} />,
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (lastIndex < text.length) {
    parts.push(...renderInlineCode(text.slice(lastIndex), parts.length));
  }

  return parts.length > 0 ? parts : text;
}

function renderInlineCode(text: string, keyOffset: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const inlineRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <code
        key={`ic-${keyOffset}-${parts.length}`}
        className="bg-[#012] text-[#33ff33] font-[Fixedsys,Terminal,'Courier_New',monospace] text-[10px] px-[3px] py-[1px] border border-[#808080] shadow-[inset_1px_1px_0_#404040]"
      >
        {match[1]}
      </code>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
const WIN98_BORDER =
  "border-2 border-solid border-t-white border-l-white border-b-[#808080] border-r-[#808080]";
const WIN98_BORDER_INSET =
  "border-2 border-solid border-t-[#808080] border-l-[#808080] border-b-white border-r-white";

const Balloon = forwardRef<BalloonHandle, BalloonProps>(function Balloon(
  { targetEl, characterName = "Clippy" },
  ref,
) {
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ bottom: -9999, right: -9999 });
  const [speakContent, setSpeakContent] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputEnabled, setInputEnabled] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  const hiddenRef = useRef(true);
  const activeRef = useRef(false);
  const holdRef = useRef(false);
  const hidingRef = useRef<number | null>(null);
  const loopRef = useRef<number | undefined>(undefined);
  const addWordRef = useRef<(() => void) | undefined>(undefined);
  const completeRef = useRef<() => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onSubmitRef = useRef<((text: string, images: string[]) => void) | null>(
    null,
  );
  const msgIdRef = useRef(0);

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

      enableInput(onSubmit: (text: string, images: string[]) => void) {
        onSubmitRef.current = onSubmit;
        setInputEnabled(true);
        hiddenRef.current = false;
        reposition();
        setVisible(true);
      },

      focusInput() {
        inputRef.current?.focus();
      },

      addMessage(role: "user" | "assistant", text: string, images?: string[]) {
        setMessages((prev) => [
          ...prev,
          { id: msgIdRef.current++, role, text, images },
        ]);
        hiddenRef.current = false;
        setVisible(true);
        setMinimized(false);
      },

      getMessages() {
        // Return a snapshot — we access the state ref-style via a closure trick
        let current: Message[] = [];
        setMessages((prev) => {
          current = prev;
          return prev;
        });
        return current;
      },

      setMessages(msgs: Message[]) {
        msgIdRef.current = msgs.length;
        setMessages(msgs.map((m, i) => ({ ...m, id: i })));
        hiddenRef.current = false;
        setVisible(true);
        setMinimized(false);
      },

      clearMessages() {
        msgIdRef.current = 0;
        setMessages([]);
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

  const addImageFiles = useCallback((files: FileList | File[]) => {
    Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result)
            setPendingImages((prev) => [...prev, e.target!.result as string]);
        };
        reader.readAsDataURL(file);
      });
  }, []);

  const submitInput = useCallback(() => {
    const text = inputValue.trim();
    if ((!text && pendingImages.length === 0) || !onSubmitRef.current) return;
    const images = pendingImages;
    setInputValue("");
    setPendingImages([]);
    onSubmitRef.current(text, images);
  }, [inputValue, pendingImages]);

  return createPortal(
    <div
      data-interactive
      className={`fixed z-[10001] cursor-default bg-[#d4d0c8] text-black ${WIN98_BORDER} shadow-[1px_1px_0_#000000] ${inputEnabled ? "p-0 w-80" : "p-2 max-w-[230px]"} ${visible ? "block" : "hidden"}`}
      style={{
        bottom: anchor.bottom,
        right: anchor.right,
      }}
    >
      {!inputEnabled && (
        <div
          className={`max-w-[200px] min-w-[120px] ${WIN98_FONT} whitespace-pre-wrap break-words`}
        >
          {speakContent}
        </div>
      )}

      {inputEnabled && (
        <>
          {/* Title bar */}
          <div className="flex items-center justify-between bg-gradient-to-r from-[#000080] to-[#1084d0] py-[2px] pr-[2px] pl-1 gap-1">
            <span
              className={`${WIN98_FONT} font-bold text-white flex-1 overflow-hidden whitespace-nowrap text-ellipsis`}
            >
              Chat with {characterName}
            </span>
            <div className="flex gap-[2px]">
              <button
                className={`${WIN98_FONT} text-[10px] font-bold bg-[#d4d0c8] ${WIN98_BORDER} w-[16px] h-[15px] px-[3px] py-0 cursor-pointer flex items-center justify-center shrink-0 leading-none`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setMinimized((m) => !m)}
                title={minimized ? "Restore" : "Minimize"}
              >
                {minimized ? (
                  <svg width="9" height="9" viewBox="0 0 9 9" className="block">
                    {/* back square */}
                    <rect
                      x="0"
                      y="2"
                      width="7"
                      height="7"
                      fill="none"
                      stroke="black"
                      strokeWidth="1"
                    />
                    {/* front square */}
                    <rect
                      x="2"
                      y="0"
                      width="7"
                      height="7"
                      fill="#d4d0c8"
                      stroke="black"
                      strokeWidth="1"
                    />
                    {/* double top border on front square */}
                    <line
                      x1="2"
                      y1="1"
                      x2="9"
                      y2="1"
                      stroke="black"
                      strokeWidth="1"
                    />
                  </svg>
                ) : (
                  "_"
                )}
              </button>
              {/*<button
                className={`${WIN98_FONT} text-[10px] font-bold bg-[#d4d0c8] ${WIN98_BORDER} w-[16px] h-[15px] px-[3px] py-0 cursor-pointer flex items-center justify-center shrink-0 leading-none`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => getCurrentWindow().close()}
                title="Close"
              >
                ✕
              </button>*/}
            </div>
          </div>

          {!minimized && (
            <div
              className="p-2 flex flex-col gap-2"
              onDragOver={(e: DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e: DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                if (e.dataTransfer.files.length)
                  addImageFiles(e.dataTransfer.files);
              }}
            >
              <div
                ref={historyRef}
                className={`flex flex-col max-h-[40vh] overflow-y-auto py-1 ${WIN98_FONT} leading-[1.4] win95-scrollbar`}
              >
                {messages.map((msg) => (
                  <div key={msg.id} className="mb-[2px]">
                    <b
                      className={
                        msg.role === "user"
                          ? "text-[#000080]"
                          : "text-[#006400]"
                      }
                    >
                      {msg.role === "user" ? "You: " : `${characterName}: `}
                    </b>
                    {renderMessageText(msg.text)}
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {msg.images.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            className="max-w-[72px] max-h-[72px] object-cover border border-[#808080]"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {pendingImages.map((src, i) => (
                    <div key={i} className="relative">
                      <img
                        src={src}
                        className="max-w-[48px] max-h-[48px] object-cover border border-[#808080]"
                      />
                      <button
                        className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#d4d0c8] border border-[#808080] text-[8px] leading-none flex items-center justify-center cursor-pointer"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          setPendingImages((prev) =>
                            prev.filter((_, j) => j !== i),
                          )
                        }
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1">
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
                  className={`flex-1 min-w-0 ${WIN98_FONT} ${WIN98_BORDER_INSET} bg-white py-[2px] px-1 outline-none`}
                />
                <input
                  ref={fileInputRef}
                  id="balloon-file-input"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addImageFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor="balloon-file-input"
                  className={`${WIN98_FONT} bg-[#d4d0c8] ${WIN98_BORDER} py-[1px] px-[3px] cursor-pointer shrink-0 select-none`}
                  title="Attach image"
                >
                  🖼
                </label>
                <button
                  className={`${WIN98_FONT} bg-[#d4d0c8] ${WIN98_BORDER} py-[1px] px-[5px] cursor-pointer whitespace-nowrap shrink-0`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={submitInput}
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
});

export default Balloon;
