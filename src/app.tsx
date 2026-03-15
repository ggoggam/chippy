import { useState, useEffect, useCallback, useRef } from "react";
import { initAgent, type AgentLoaders } from "./lib/agent";
import type Agent from "./lib/agent";
import { LLMClient, parseAction, ACTION_ANIMATIONS } from "./lib/llm";
import ContextMenu, { type MenuItem } from "./components/context-menu";
import SettingsPanel from "./components/settings-panel";
import { startClickthroughTracking, stopClickthroughTracking } from "./lib/clickthrough";

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
  Clippy: "It looks like you're building something. Would you like help with that?",
  Rocky: "...",
};

const llmRef = new LLMClient();

export default function App() {
  const agentRef = useRef<Agent | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleChat = useCallback(async (text: string) => {
    const agent = agentRef.current;
    if (!agent) return;

    agent._balloon.addMessage("user", text);

    if (!llmRef.getApiKey()) {
      agent._balloon.addMessage("assistant", "I'll need your Anthropic API key first! Right-click me and choose Settings.");
      return;
    }

    agent.play("Thinking");

    const stream = agent._balloon.streamMessage();
    try {
      let buffer = "";
      let actionResolved = false;

      for await (const chunk of llmRef.chat(text)) {
        if (!actionResolved) {
          buffer += chunk;
          // Check if we have the full action tag yet
          const closingIdx = buffer.indexOf("]");
          if (closingIdx !== -1) {
            actionResolved = true;
            const { action, text: remaining } = parseAction(buffer);
            if (action && agent.hasAnimation(action)) {
              agent._animator.exitAnimation(); // Exit Thinking early
              agent.play(action);
            }
            if (remaining) stream.push(remaining);
          }
          // If buffer gets too long without a tag, flush it as-is
          else if (buffer.length > 50) {
            actionResolved = true;
            stream.push(buffer);
          }
        } else {
          stream.push(chunk);
        }
      }

      // If stream ended before we resolved the action, flush buffer
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
      agent._balloon.addMessage("assistant", msg);
    }
  }, []);

  const loadCharacter = useCallback(
    async (name: CharacterName) => {
      if (agentRef.current) {
        agentRef.current.dispose();
        agentRef.current = null;
      }
      llmRef.clearHistory();

      const agent = await initAgent(CHARACTERS[name], name);
      agentRef.current = agent;

      // Tell LLM which action animations this character supports
      const available = agent.animations().filter((a) => a in ACTION_ANIMATIONS);
      llmRef.setAvailableActions(available);

      agent.show();
      agent._balloon.enableInput(handleChat);
      agent._balloon.addMessage("assistant", GREETINGS[name]);
    },
    [handleChat]
  );

  useEffect(() => {
    const saved = (localStorage.getItem("character") as CharacterName) ?? "Clippy";
    const name = saved in CHARACTERS ? saved : "Clippy";
    loadCharacter(name);
    return () => {
      agentRef.current?.dispose();
      agentRef.current = null;
    };
  }, [loadCharacter]);

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

  const menuItems: MenuItem[] = [
    {
      label: "Switch to Clippy",
      action: () => {
        localStorage.setItem("character", "Clippy");
        loadCharacter("Clippy");
      },
    },
    {
      label: "Switch to Rocky",
      action: () => {
        localStorage.setItem("character", "Rocky");
        loadCharacter("Rocky");
      },
    },
    "separator",
    {
      label: "Chat...",
      action: () => agentRef.current?._balloon.focusInput(),
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
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />
      )}
      {settingsOpen && (
        <SettingsPanel
          targetEl={agentRef.current?._el ?? null}
          currentKey={llmRef.getApiKey()}
          onSave={(key) => {
            llmRef.setApiKey(key);
            agentRef.current?._balloon.addMessage("assistant", "Got it! I'm ready to chat.");
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
