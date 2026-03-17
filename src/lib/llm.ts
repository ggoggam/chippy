import Anthropic from "@anthropic-ai/sdk";

/** Animations the LLM can choose from, with descriptions for the system prompt. */
export const ACTION_ANIMATIONS: Record<string, string> = {
  Explain: "explaining or teaching something",
  Congratulate: "celebrating, praising, or positive feedback",
  GetAttention: "something important or urgent",
  Thinking: "pondering or considering deeply",
  Writing: "discussing writing, code, or composing",
  Searching: "looking something up or investigating",
  Alert: "warning or caution",
  Wave: "greeting or farewell",
  GetTechy: "technical topics, programming, computers",
  GetArtsy: "creative, artistic, or design topics",
  GetWizardy: "something magical, amazing, or mind-blowing",
  Print: "printing or outputting documents",
  Save: "saving files or data",
  SendMail: "email or messaging",
  EmptyTrash: "deleting or cleaning up",
  Greeting: "saying hello or welcoming",
  CheckingSomething: "reviewing or verifying something",
  Processing: "working on or computing something",
};

function buildSystemPrompt(actions: string[]): string {
  const available = actions.filter((a) => a in ACTION_ANIMATIONS);
  const list = available
    .map((a) => `- ${a}: ${ACTION_ANIMATIONS[a]}`)
    .join("\n");
  return `You are a helpful desktop assistant character. Keep responses concise (2-3 sentences max).

You MUST start every response with an action tag on its own line that determines your animation. Format: [action:ActionName]

Available actions:
${list}

Pick the most fitting action for your response. Then write your response text after the tag.

Example:
[action:Explain]
The map function transforms each element in an array using a callback.`;
}

/** Parse "[action:Name]" prefix from streamed text. Returns action and remaining text. */
export function parseAction(raw: string): {
  action: string | null;
  text: string;
} {
  const match = raw.match(/^\[action:(\w+)\]\n?/);
  if (match) {
    return { action: match[1], text: raw.slice(match[0].length) };
  }
  return { action: null, text: raw };
}

export const MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

const DEFAULT_MODEL: ModelId = "claude-haiku-4-5";

export class LLMClient {
  private client: Anthropic | null = null;
  private history: Anthropic.MessageParam[] = [];
  private _availableActions: string[] = [];
  private _model: ModelId;

  constructor() {
    const key = this.getApiKey();
    if (key) this._init(key);
    const saved = localStorage.getItem("model") as ModelId | null;
    this._model = saved && MODELS.some((m) => m.id === saved) ? saved : DEFAULT_MODEL;
  }

  getModel(): ModelId {
    return this._model;
  }

  setModel(model: ModelId) {
    this._model = model;
    localStorage.setItem("model", model);
  }

  private _init(key: string) {
    this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  }

  getApiKey(): string | null {
    return localStorage.getItem("anthropic_api_key");
  }

  setApiKey(key: string) {
    localStorage.setItem("anthropic_api_key", key);
    this._init(key);
  }

  setAvailableActions(animations: string[]) {
    this._availableActions = animations;
  }

  clearHistory() {
    this.history = [];
  }

  restoreMessage(role: "user" | "assistant", text: string) {
    this.history.push({ role, content: text });
  }

  async *chat(userText: string, images: string[] = []): AsyncIterable<string> {
    if (!this.client) throw new Error("no_api_key");

    const content: Anthropic.ContentBlockParam[] = [];
    for (const dataUrl of images) {
      const [meta, data] = dataUrl.split(",");
      const mediaType = (meta.match(/data:([^;]+)/)?.[1] ??
        "image/png") as Anthropic.Base64ImageSource["media_type"];
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      });
    }
    content.push({ type: "text", text: userText || "(image)" });

    this.history.push({
      role: "user",
      content: images.length ? content : userText,
    });

    const stream = this.client.messages.stream({
      model: this._model,
      max_tokens: 4096,
      system: buildSystemPrompt(this._availableActions),
      messages: this.history,
    });

    let assistantText = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        assistantText += event.delta.text;
        yield event.delta.text;
      }
    }

    if (assistantText) {
      this.history.push({ role: "assistant", content: assistantText });
    }
  }
}
