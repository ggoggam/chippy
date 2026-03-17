import { useState } from "react";
import {
  loadConversations,
  deleteConversation,
  clearAllConversations,
  type Conversation,
} from "../lib/history";

const WIN98_FONT = "font-[Tahoma,Microsoft_Sans_Serif,sans-serif] text-[11px]";
const WIN98_BORDER =
  "border-2 border-solid border-t-white border-l-white border-b-[#808080] border-r-[#808080]";
const WIN98_BORDER_INSET =
  "border-2 border-solid border-t-[#808080] border-l-[#808080] border-b-white border-r-white";

interface HistoryPanelProps {
  targetEl: HTMLElement | null;
  onLoad: (conv: Conversation) => void;
  onClose: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function HistoryPanel({
  targetEl,
  onLoad,
  onClose,
}: HistoryPanelProps) {
  const [conversations, setConversations] = useState(() =>
    loadConversations(),
  );
  const [confirmClear, setConfirmClear] = useState(false);

  const handleDelete = (id: string) => {
    deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearAllConversations();
    setConversations([]);
    setConfirmClear(false);
  };

  // Position near character
  const style: React.CSSProperties = {};
  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    style.bottom = window.innerHeight - rect.top + 15;
    style.right = window.innerWidth - rect.left - rect.width;
  }

  return (
    <div
      data-interactive
      className={`fixed z-[10002] bg-[#d4d0c8] ${WIN98_BORDER} shadow-[1px_1px_0_#000000] w-72`}
      style={style}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between bg-gradient-to-r from-[#000080] to-[#1084d0] py-[2px] pr-[2px] pl-1 gap-1">
        <span
          className={`${WIN98_FONT} font-bold text-white flex-1 overflow-hidden whitespace-nowrap text-ellipsis`}
        >
          Conversation History
        </span>
        <button
          className={`${WIN98_FONT} text-[10px] font-bold bg-[#d4d0c8] ${WIN98_BORDER} w-[16px] h-[15px] px-[3px] py-0 cursor-pointer flex items-center justify-center shrink-0 leading-none`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="p-2 flex flex-col gap-2">
        {/* Conversation list */}
        <div
          className={`${WIN98_BORDER_INSET} bg-white max-h-[50vh] overflow-y-auto win95-scrollbar`}
        >
          {conversations.length === 0 ? (
            <div
              className={`${WIN98_FONT} text-[#808080] p-3 text-center italic`}
            >
              No saved conversations
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className="flex items-center gap-1 px-1 py-[3px] hover:bg-[#000080] hover:text-white group cursor-default border-b border-[#d4d0c8]"
                onClick={() => onLoad(conv)}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className={`${WIN98_FONT} truncate font-bold`}
                    title={conv.title}
                  >
                    {conv.title}
                  </div>
                  <div
                    className={`${WIN98_FONT} text-[9px] text-[#808080] group-hover:text-[#a0a0ff]`}
                  >
                    {conv.messages.length} msgs · {formatDate(conv.updatedAt)}
                  </div>
                </div>
                <button
                  className={`${WIN98_FONT} text-[9px] bg-[#d4d0c8] ${WIN98_BORDER} px-1 py-0 cursor-pointer shrink-0 opacity-0 group-hover:opacity-100`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(conv.id);
                  }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        {conversations.length > 0 && (
          <div className="flex justify-end gap-1">
            <button
              className={`${WIN98_FONT} bg-[#d4d0c8] ${WIN98_BORDER} py-[2px] px-2 cursor-pointer`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClearAll}
            >
              {confirmClear ? "Are you sure?" : "Clear All"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
