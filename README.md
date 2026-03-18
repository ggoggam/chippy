# Chippy

A modern reimagining of the Microsoft Office Assistant (Clippy, Rocky, etc.) from the late 1990s/early 2000s. Built with Tauri v2 + React + TypeScript, with Windows 95/98 aesthetics and LLM-powered responses via the Anthropic API.

## Features

- Animated characters (Clippy, Rocky) via sprite sheets
- Speech bubbles with word-by-word streaming
- LLM-powered responses (Claude)
- Transparent, always-on-top, borderless window
- Right-click context menu for character/settings

## Development

**Prerequisites:** [bun](https://bun.sh), [Rust](https://rustup.rs), [mise](https://mise.jdx.dev) (optional)

```bash
bun install
mise run dev        # or: bun run tauri dev
```

**Other commands:**
```bash
bun run build       # TypeScript compile + Vite build + Tauri bundle
bunx tsc --noEmit   # type-check only
cargo check         # Rust type/borrow check (from src-tauri/)
```

## Releasing

Releases are built automatically via GitHub Actions for macOS (Apple Silicon + Intel), Linux, and Windows.

To publish a new release, push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This creates a draft GitHub Release with platform-specific installers attached. Review and publish the draft when ready.

### macOS note

Builds are unsigned. Users will need to right-click → Open the first time to bypass Gatekeeper, or run:

```bash
xattr -cr /Applications/Chippy.app
```
