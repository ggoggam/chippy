import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = "";

export class LLMClient {
  private client: Anthropic | null = null;
  private history: Anthropic.MessageParam[] = [];

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

  clearHistory() {
    this.history = [];
  }

  async *chat(userText: string): AsyncIterable<string> {
    if (!this.client) throw new Error("no_api_key");

    this.history.push({ role: "user", content: userText });

    const stream = this.client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
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
