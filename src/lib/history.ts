const STORAGE_KEY = "conversation_history";
const MAX_CONVERSATIONS = 50;

export interface SavedMessage {
  role: "user" | "assistant";
  text: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: SavedMessage[];
  createdAt: number;
  updatedAt: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function titleFromMessages(messages: SavedMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  const text = first.text.trim();
  return text.length > 60 ? text.slice(0, 57) + "..." : text;
}

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

function save(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function saveConversation(
  messages: SavedMessage[],
  existingId?: string,
): string | null {
  // Don't save empty or greeting-only conversations
  if (messages.length < 2) return null;

  const conversations = loadConversations();
  const now = Date.now();

  if (existingId) {
    const idx = conversations.findIndex((c) => c.id === existingId);
    if (idx !== -1) {
      conversations[idx].messages = messages;
      conversations[idx].title = titleFromMessages(messages);
      conversations[idx].updatedAt = now;
      save(conversations);
      return existingId;
    }
  }

  const id = generateId();
  const conv: Conversation = {
    id,
    title: titleFromMessages(messages),
    messages,
    createdAt: now,
    updatedAt: now,
  };

  conversations.unshift(conv);
  // Trim to max
  if (conversations.length > MAX_CONVERSATIONS) {
    conversations.length = MAX_CONVERSATIONS;
  }
  save(conversations);
  return id;
}

export function deleteConversation(id: string) {
  const conversations = loadConversations().filter((c) => c.id !== id);
  save(conversations);
}

export function clearAllConversations() {
  localStorage.removeItem(STORAGE_KEY);
}
