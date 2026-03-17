import { useState, useEffect, useCallback, useRef } from "react";
import AgentComponent, {
  loadAgentData,
  type AgentLoaders,
  type AgentHandle,
} from "./components/agent";
import { LLMClient, parseAction, ACTION_ANIMATIONS, MODELS, PROVIDERS, type ModelId, type Provider } from "./lib/llm";
import ContextMenu, { type MenuItem } from "./components/context-menu";
import SettingsPanel from "./components/settings-panel";
import HistoryPanel from "./components/history-panel";
import {
  saveConversation,
  type Conversation,
  type SavedMessage,
} from "./lib/history";
import {
  startClickthroughTracking,
  stopClickthroughTracking,
} from "./lib/clickthrough";
import { getCurrentWindow } from "@tauri-apps/api/window";

type CharacterName = "Clippy" | "Rocky";

const CHARACTERS: Record<CharacterName, AgentLoaders> = {
  Clippy: {
    agent: () => import("./assets/clippy/agent"),
    sound: () => import("./assets/clippy/sounds-mp3"),
    map: () => import("./assets/clippy/map.png"),
  },
  Rocky: {
    agent: () => import("./assets/rocky/agent"),
    sound: () => import("./assets/rocky/sounds-mp3"),
    map: () => import("./assets/rocky/map.png"),
  },
};

const GREETINGS: Record<CharacterName, string> = {
  Clippy:
    "It looks like you're building something. Would you like help with that?",
  Rocky: "...",
};

const llmRef = new LLMClient();

export default function App() {
  const agentRef = useRef<AgentHandle>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const [characterName, setCharacterName] = useState<CharacterName>(() => {
    const saved = localStorage.getItem("character") as CharacterName;
    return saved in CHARACTERS ? saved : "Clippy";
  });
  const [model, setModel] = useState<ModelId>(() => llmRef.getModel());
  const [agentData, setAgentData] = useState<{
    mapUrl: string;
    data: any;
    sounds: Record<string, string>;
  } | null>(null);

  const autoSave = useCallback(() => {
    const agent = agentRef.current;
    if (!agent) return;
    const msgs = agent.getMessages();
    if (msgs.length < 2) return;
    const saved: SavedMessage[] = msgs.map((m) => ({
      role: m.role,
      text: m.text,
    }));
    const id = saveConversation(saved, conversationIdRef.current ?? undefined);
    if (id) conversationIdRef.current = id;
  }, []);

  const handleChat = useCallback(async (text: string, images: string[] = []) => {
    const agent = agentRef.current;
    if (!agent) return;

    agent.addMessage("user", text, images);

    if (!llmRef.hasKeyForCurrentModel()) {
      const provider = PROVIDERS[llmRef.getProvider()].label;
      agent.addMessage(
        "assistant",
        `I'll need your ${provider} API key first! Right-click me and choose Settings.`,
      );
      return;
    }

    agent.play("Thinking");

    const stream = agent.streamMessage();
    try {
      let buffer = "";
      let actionResolved = false;

      for await (const chunk of llmRef.chat(text, images)) {
        if (!actionResolved) {
          buffer += chunk;
          const closingIdx = buffer.indexOf("]");
          if (closingIdx !== -1) {
            actionResolved = true;
            const { action, text: remaining } = parseAction(buffer);
            if (action && agent.hasAnimation(action)) {
              agent.exitAnimation();
              agent.play(action);
            }
            if (remaining) stream.push(remaining);
          } else if (buffer.length > 50) {
            actionResolved = true;
            stream.push(buffer);
          }
        } else {
          stream.push(chunk);
        }
      }

      if (!actionResolved && buffer) {
        const { action, text: remaining } = parseAction(buffer);
        if (action && agent.hasAnimation(action)) {
          agent.play(action);
        }
        if (remaining) stream.push(remaining);
      }

      stream.done();
      autoSave();
    } catch (err) {
      const provider = PROVIDERS[llmRef.getProvider()].label;
      const msg =
        err instanceof Error && err.message === "no_api_key"
          ? `I'll need your ${provider} API key first! Right-click me and choose Settings.`
          : "Hmm, something went wrong. Please check your API key in Settings.";
      agent.addMessage("assistant", msg);
    }
  }, [autoSave]);

  const handleNewChat = useCallback(() => {
    autoSave();
    llmRef.clearHistory();
    conversationIdRef.current = null;
    agentRef.current?.clearMessages();
    agentRef.current?.addMessage("assistant", GREETINGS[characterName]);
  }, [autoSave, characterName]);

  const handleLoadConversation = useCallback(
    (conv: Conversation) => {
      autoSave();
      llmRef.clearHistory();
      conversationIdRef.current = conv.id;

      // Rebuild LLM history from saved messages
      for (const msg of conv.messages) {
        llmRef.restoreMessage(msg.role, msg.text);
      }

      const agent = agentRef.current;
      if (agent) {
        agent.setMessages(
          conv.messages.map((m, i) => ({
            id: i,
            role: m.role,
            text: m.text,
          })),
        );
      }
      setHistoryOpen(false);
    },
    [autoSave],
  );

  // Load character data
  useEffect(() => {
    setAgentData(null);
    autoSave();
    llmRef.clearHistory();
    conversationIdRef.current = null;
    let cancelled = false;
    loadAgentData(CHARACTERS[characterName]).then((data) => {
      if (!cancelled) setAgentData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [characterName]);

  // Called by AgentComponent once Animator + Balloon are fully ready.
  const handleAgentReady = useCallback(() => {
    const agent = agentRef.current;
    if (!agent) return;

    const available = agent
      .animations()
      .filter((a) => a in ACTION_ANIMATIONS);
    llmRef.setAvailableActions(available);

    agent.show();
    agent.enableInput(handleChat);
    agent.addMessage("assistant", GREETINGS[characterName]);
  }, [handleChat, characterName]);

  useEffect(() => {
    startClickthroughTracking();
    return () => stopClickthroughTracking();
  }, []);

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const switchCharacter = useCallback((name: CharacterName) => {
    localStorage.setItem("character", name);
    setCharacterName(name);
  }, []);

  const switchModel = useCallback((id: ModelId) => {
    llmRef.setModel(id);
    setModel(id);
  }, []);

  const menuItems: MenuItem[] = [
    {
      label: "Switch to Clippy",
      action: () => switchCharacter("Clippy"),
      checked: characterName === "Clippy",
    },
    {
      label: "Switch to Rocky",
      action: () => switchCharacter("Rocky"),
      checked: characterName === "Rocky",
    },
    "separator",
    ...(["anthropic", "openai", "google"] as Provider[]).flatMap((p) => [
      { label: PROVIDERS[p].label, disabled: true as const },
      ...MODELS.filter((m) => m.provider === p).map((m) => ({
        label: `  ${m.label}`,
        action: () => switchModel(m.id),
        checked: model === m.id,
      })),
    ]),
    "separator",
    {
      label: "New Chat",
      action: handleNewChat,
    },
    {
      label: "History...",
      action: () => {
        autoSave();
        setHistoryOpen(true);
      },
    },
    {
      label: "Animate",
      action: () => agentRef.current?.animate(),
    },
    {
      label: "Hide",
      action: () => agentRef.current?.hide(),
    },
    "separator",
    {
      label: "Settings...",
      action: () => setSettingsOpen(true),
    },
    {
      label: "Close",
      action: () => getCurrentWindow().close(),
    },
  ];

  return (
    <>
      {agentData && (
        <AgentComponent
          ref={agentRef}
          key={characterName}
          mapUrl={agentData.mapUrl}
          data={agentData.data}
          sounds={agentData.sounds}
          characterName={characterName}
          onReady={handleAgentReady}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={closeMenu}
        />
      )}
      {historyOpen && (
        <HistoryPanel
          targetEl={agentRef.current?.getElement() ?? null}
          onLoad={handleLoadConversation}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          targetEl={agentRef.current?.getElement() ?? null}
          getKey={(p) => llmRef.getApiKey(p)}
          onSave={(provider, key) => {
            llmRef.setApiKey(provider, key);
            agentRef.current?.addMessage(
              "assistant",
              "Got it! I'm ready to chat.",
            );
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
