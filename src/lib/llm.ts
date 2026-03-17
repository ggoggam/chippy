import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

// ---------------------------------------------------------------------------
// Provider & model definitions
// ---------------------------------------------------------------------------

export type Provider = "anthropic" | "openai" | "google";

export interface ModelDef {
  id: string;
  label: string;
  provider: Provider;
}

export const PROVIDERS: Record<Provider, { label: string; keyPlaceholder: string }> = {
  anthropic: { label: "Anthropic", keyPlaceholder: "sk-ant-..." },
  openai: { label: "OpenAI", keyPlaceholder: "sk-..." },
  google: { label: "Google", keyPlaceholder: "AIza..." },
};

export const MODELS: ModelDef[] = [
  // Anthropic
  { id: "claude-haiku-4-5", label: "Haiku 4.5", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "anthropic" },
  { id: "claude-opus-4-6", label: "Opus 4.6", provider: "anthropic" },
  // OpenAI
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai" },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "openai" },
  { id: "o3-mini", label: "o3-mini", provider: "openai" },
  // Google
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google" },
];

export type ModelId = string;

const DEFAULT_MODEL = "claude-haiku-4-5";

function providerForModel(modelId: string): Provider {
  const m = MODELS.find((m) => m.id === modelId);
  return m?.provider ?? "anthropic";
}

// ---------------------------------------------------------------------------
// LLMClient
// ---------------------------------------------------------------------------

interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
  images?: string[]; // base64 data URLs (user only)
}

export class LLMClient {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private google: GoogleGenerativeAI | null = null;
  private history: HistoryMessage[] = [];
  private _availableActions: string[] = [];
  private _model: string;

  constructor() {
    const anthropicKey = this.getApiKey("anthropic");
    if (anthropicKey) this.anthropic = new Anthropic({ apiKey: anthropicKey, dangerouslyAllowBrowser: true });

    const openaiKey = this.getApiKey("openai");
    if (openaiKey) this.openai = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });

    const googleKey = this.getApiKey("google");
    if (googleKey) this.google = new GoogleGenerativeAI(googleKey);

    const saved = localStorage.getItem("model");
    this._model = saved && MODELS.some((m) => m.id === saved) ? saved : DEFAULT_MODEL;
  }

  // -- Model --

  getModel(): string {
    return this._model;
  }

  setModel(model: string) {
    this._model = model;
    localStorage.setItem("model", model);
  }

  getProvider(): Provider {
    return providerForModel(this._model);
  }

  // -- API keys (per provider) --

  getApiKey(provider: Provider): string | null {
    // Legacy support: "anthropic_api_key"
    if (provider === "anthropic") {
      return localStorage.getItem("anthropic_api_key");
    }
    return localStorage.getItem(`${provider}_api_key`);
  }

  setApiKey(provider: Provider, key: string) {
    if (provider === "anthropic") {
      localStorage.setItem("anthropic_api_key", key);
      this.anthropic = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    } else if (provider === "openai") {
      localStorage.setItem("openai_api_key", key);
      this.openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    } else {
      localStorage.setItem("google_api_key", key);
      this.google = new GoogleGenerativeAI(key);
    }
  }

  hasKeyForCurrentModel(): boolean {
    const provider = this.getProvider();
    return !!this.getApiKey(provider);
  }

  // -- Actions & history --

  setAvailableActions(animations: string[]) {
    this._availableActions = animations;
  }

  clearHistory() {
    this.history = [];
  }

  restoreMessage(role: "user" | "assistant", text: string) {
    this.history.push({ role, text });
  }

  // -- Chat --

  async *chat(userText: string, images: string[] = []): AsyncIterable<string> {
    const provider = this.getProvider();

    if (provider === "anthropic" && !this.anthropic) throw new Error("no_api_key");
    if (provider === "openai" && !this.openai) throw new Error("no_api_key");
    if (provider === "google" && !this.google) throw new Error("no_api_key");

    this.history.push({ role: "user", text: userText, images: images.length ? images : undefined });

    const system = buildSystemPrompt(this._availableActions);

    if (provider === "anthropic") {
      yield* this._chatAnthropic(system);
    } else if (provider === "openai") {
      yield* this._chatOpenAI(system);
    } else {
      yield* this._chatGoogle(system);
    }
  }

  // -- Anthropic --

  private async *_chatAnthropic(system: string): AsyncIterable<string> {
    const messages: Anthropic.MessageParam[] = this.history.map((m) => {
      if (m.role === "user" && m.images?.length) {
        const content: Anthropic.ContentBlockParam[] = [];
        for (const dataUrl of m.images) {
          const [meta, data] = dataUrl.split(",");
          const mediaType = (meta.match(/data:([^;]+)/)?.[1] ??
            "image/png") as Anthropic.Base64ImageSource["media_type"];
          content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
        }
        content.push({ type: "text", text: m.text || "(image)" });
        return { role: "user" as const, content };
      }
      return { role: m.role, content: m.text };
    });

    const stream = this.anthropic!.messages.stream({
      model: this._model,
      max_tokens: 4096,
      system,
      messages,
    });

    let assistantText = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        assistantText += event.delta.text;
        yield event.delta.text;
      }
    }
    if (assistantText) this.history.push({ role: "assistant", text: assistantText });
  }

  // -- OpenAI --

  private async *_chatOpenAI(system: string): AsyncIterable<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
    ];

    for (const m of this.history) {
      if (m.role === "user" && m.images?.length) {
        const content: OpenAI.ChatCompletionContentPart[] = [];
        for (const dataUrl of m.images) {
          content.push({ type: "image_url", image_url: { url: dataUrl } });
        }
        content.push({ type: "text", text: m.text || "(image)" });
        messages.push({ role: "user", content });
      } else {
        messages.push({ role: m.role, content: m.text });
      }
    }

    const stream = await this.openai!.chat.completions.create({
      model: this._model,
      max_tokens: 4096,
      stream: true,
      messages,
    });

    let assistantText = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        assistantText += delta;
        yield delta;
      }
    }
    if (assistantText) this.history.push({ role: "assistant", text: assistantText });
  }

  // -- Google (Gemini) --

  private async *_chatGoogle(system: string): AsyncIterable<string> {
    const model = this.google!.getGenerativeModel({
      model: this._model,
      systemInstruction: system,
    });

    // Build Gemini history (all but last message)
    const geminiHistory: { role: "user" | "model"; parts: any[] }[] = [];
    for (const m of this.history.slice(0, -1)) {
      const parts: any[] = [];
      if (m.role === "user" && m.images?.length) {
        for (const dataUrl of m.images) {
          const [meta, data] = dataUrl.split(",");
          const mimeType = meta.match(/data:([^;]+)/)?.[1] ?? "image/png";
          parts.push({ inlineData: { mimeType, data } });
        }
      }
      parts.push({ text: m.text || "(image)" });
      geminiHistory.push({
        role: m.role === "assistant" ? "model" : "user",
        parts,
      });
    }

    // Last message is always user
    const last = this.history[this.history.length - 1];
    const lastParts: any[] = [];
    if (last.images?.length) {
      for (const dataUrl of last.images) {
        const [meta, data] = dataUrl.split(",");
        const mimeType = meta.match(/data:([^;]+)/)?.[1] ?? "image/png";
        lastParts.push({ inlineData: { mimeType, data } });
      }
    }
    lastParts.push({ text: last.text || "(image)" });

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessageStream(lastParts);

    let assistantText = "";
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        assistantText += text;
        yield text;
      }
    }
    if (assistantText) this.history.push({ role: "assistant", text: assistantText });
  }
}
