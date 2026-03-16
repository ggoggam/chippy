import { useState, useEffect, useCallback, useRef } from "react";
import AgentComponent, {
  loadAgentData,
  type AgentLoaders,
  type AgentHandle,
} from "./components/agent";
import { LLMClient, parseAction, ACTION_ANIMATIONS, MODELS, type ModelId } from "./lib/llm";
import ContextMenu, { type MenuItem } from "./components/context-menu";
import SettingsPanel from "./components/settings-panel";
import {
  startClickthroughTracking,
  stopClickthroughTracking,
} from "./lib/clickthrough";

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

  const handleChat = useCallback(async (text: string, images: string[] = []) => {
    const agent = agentRef.current;
    if (!agent) return;

    agent.addMessage("user", text, images);

    if (!llmRef.getApiKey()) {
      agent.addMessage(
        "assistant",
        "I'll need your Anthropic API key first! Right-click me and choose Settings.",
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
    } catch (err) {
      const msg =
        err instanceof Error && err.message === "no_api_key"
          ? "I'll need your Anthropic API key first! Right-click me and choose Settings."
          : "Hmm, something went wrong. Please check your API key in Settings.";
      agent.addMessage("assistant", msg);
    }
  }, []);

  // Load character data
  useEffect(() => {
    setAgentData(null);
    llmRef.clearHistory();
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
    ...MODELS.map((m) => ({
      label: m.label,
      action: () => switchModel(m.id),
      checked: model === m.id,
    })),
    "separator",
    {
      label: "New Chat",
      action: () => llmRef.clearHistory(),
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
      action: () => window.close(),
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
      {settingsOpen && (
        <SettingsPanel
          targetEl={agentRef.current?.getElement() ?? null}
          currentKey={llmRef.getApiKey()}
          onSave={(key) => {
            llmRef.setApiKey(key);
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
