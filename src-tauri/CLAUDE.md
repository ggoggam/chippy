# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clippy is a Tauri v2 desktop app — a modern reimagining of the Microsoft Office Assistant (Clippy, Rocky, etc.) from the late 1990s/early 2000s. The UI mimics Windows 95/98 aesthetics. Characters are animated via sprite sheets and can speak using the Web Speech API, with LLM-powered responses via REST API (Claude or ChatGPT) planned/in progress.

## Commands

```bash
# Development (preferred via mise)
mise run dev           # equivalent to: bun run tauri dev

# Or directly:
bun run tauri dev      # start frontend dev server + Tauri window
bun run build          # TypeScript compile + Vite build + Tauri bundle
bunx tsc --noEmit      # type-check only (no emit)

# Rust backend only
cargo build            # from src-tauri/
cargo check            # fast type/borrow check
```

## Architecture

The app is split into a minimal Rust backend (Tauri) and a TypeScript frontend (vanilla, no framework).

### Frontend (`src/`)

The core abstraction is `Agent` (`src/lib/agent.ts`) — it owns the character lifecycle:
- **Animator** (`src/lib/animator.ts`) — drives sprite sheet frame playback. Each animation is a graph of frames with `branching` paths (random or looping).
- **Balloon** (`src/lib/balloon.ts`) — speech bubble DOM element; supports word-by-word streaming via `speakStream()`.
- **Queue** (`src/lib/queue.ts`) — serializes actions (animations, speech, sounds) so they run sequentially.

`main.ts` wires up character selection (persisted to `localStorage`), the right-click context menu, and window drag behavior.

### Character Assets (`src/assets/<name>/`)

Each character directory exports:
- `agent.ts` — full animation/frame/sound definition (large object)
- `sounds-mp3.ts` — audio file references (base64 or URL)
- `map.png` — sprite sheet

Characters are loaded via dynamic `import()` so they are code-split.

### Backend (`src-tauri/`)

Minimal Rust — the Tauri builder, `tauri-plugin-opener`, and a placeholder `greet` command. LLM API calls are expected to be added here as Tauri commands (invoked from frontend via `@tauri-apps/api/core`'s `invoke()`).

### Key Patterns

- **Streaming speech**: `Agent.speakStream()` / `Balloon.speakStream()` already support incremental text rendering — ready for LLM token streaming.
- **Window**: transparent, borderless, always-on-top, skips taskbar. Positioned/clamped to screen bounds at runtime.
- **CSP**: set to `null` in `tauri.conf.json` (no restrictions) — fine for local dev, revisit before distribution.
- **TypeScript**: strict mode, `ES2020` target, DOM libs only.
