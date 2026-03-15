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

export class LLMClient {
  private client: Anthropic | null = null;
  private history: Anthropic.MessageParam[] = [];
  private _availableActions: string[] = [];

  constructor() {
    const key = this.getApiKey();
    if (key) this._init(key);
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

  async *chat(userText: string): AsyncIterable<string> {
    if (!this.client) throw new Error("no_api_key");

    this.history.push({ role: "user", content: userText });

    const stream = this.client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 256,
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
