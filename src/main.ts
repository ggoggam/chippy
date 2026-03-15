import { initAgent, type AgentLoaders } from "./lib/agent";
import type Agent from "./lib/agent";
import SettingsPanel from "./lib/settings-panel";
import { LLMClient } from "./lib/llm";

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

const llm = new LLMClient();

let currentAgent: Agent | null = null;
let settingsPanel: SettingsPanel | null = null;

async function handleChat(text: string) {
  if (!currentAgent) return;

  currentAgent._balloon.addMessage("user", text);

  if (!llm.getApiKey()) {
    const msg = "I'll need your Anthropic API key first! Right-click me and choose Settings.";
    currentAgent.speak(msg);
    currentAgent._balloon.addMessage("assistant", msg);
    return;
  }

  currentAgent.stop();
  currentAgent.play("Thinking");

  try {
    const response = await currentAgent.speakStream(llm.chat(text));
    currentAgent._balloon.addMessage("assistant", response);
  } catch (err) {
    const msg = err instanceof Error && err.message === "no_api_key"
      ? "I'll need your Anthropic API key first! Right-click me and choose Settings."
      : "Hmm, something went wrong. Please check your API key in Settings.";
    currentAgent.speak(msg);
    currentAgent._balloon.addMessage("assistant", msg);
  }
}

async function loadCharacter(name: CharacterName) {
  if (currentAgent) {
    currentAgent.dispose();
    currentAgent = null;
  }
  if (settingsPanel) {
    settingsPanel.dispose();
    settingsPanel = null;
  }

  llm.clearHistory();

  const agent = await initAgent(CHARACTERS[name]);
  currentAgent = agent;

  agent._balloon.enableInput(handleChat);
  settingsPanel = new SettingsPanel(agent._el, (key) => {
    llm.setApiKey(key);
    agent.speak("Got it! I'm ready to chat.");
  });

  agent.show();
  agent.speak(GREETINGS[name]);
  return agent;
}

function showContextMenu(x: number, y: number) {
  document.querySelector(".context-menu")?.remove();

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  const items: Array<{ label: string; action: () => void } | "separator"> = [
    {
      label: "Switch to Clippy",
      action: async () => {
        menu.remove();
        localStorage.setItem("character", "Clippy");
        await loadCharacter("Clippy");
      },
    },
    {
      label: "Switch to Rocky",
      action: async () => {
        menu.remove();
        localStorage.setItem("character", "Rocky");
        await loadCharacter("Rocky");
      },
    },
    "separator",
    {
      label: "Chat...",
      action: () => {
        menu.remove();
        currentAgent?._balloon.focusInput();
      },
    },
    {
      label: "Animate",
      action: () => {
        menu.remove();
        currentAgent?.animate();
      },
    },
    {
      label: "Hide",
      action: () => {
        menu.remove();
        currentAgent?.hide();
      },
    },
    "separator",
    {
      label: "Settings...",
      action: () => {
        menu.remove();
        settingsPanel?.show(llm.getApiKey());
      },
    },
    {
      label: "Close",
      action: () => window.close(),
    },
  ];

  for (const item of items) {
    if (item === "separator") {
      const sep = document.createElement("hr");
      sep.className = "context-menu-separator";
      menu.appendChild(sep);
    } else {
      const el = document.createElement("div");
      el.className = "context-menu-item";
      el.textContent = item.label;
      el.addEventListener("click", item.action);
      menu.appendChild(el);
    }
  }

  document.body.appendChild(menu);

  // Keep menu on screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = x - rect.width + "px";
  if (rect.bottom > window.innerHeight) menu.style.top = y - rect.height + "px";

  const dismiss = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener("mousedown", dismiss);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", dismiss), 0);
}

window.addEventListener("DOMContentLoaded", async () => {
  const saved = (localStorage.getItem("character") as CharacterName) ?? "Clippy";
  const name = saved in CHARACTERS ? saved : "Clippy";
  await loadCharacter(name);

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });
});
