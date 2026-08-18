# Auraxis

Desktop Agentic coding assistant built with Electron + React. Auraxis brings Chat, Work, and Code into a single AI agent workspace, powered by a unified ReAct engine with DeepSeek (OpenAI / Anthropic compatible) integration.

> Auraxis evolved from the personal project **DeepFlow**. The original DeepFlow v1.x installers are archived as independent releases in this repository.

## Features

- **Three modes in one workspace**
  - **Chat** — conversational Q&A with streaming, thinking, and web search
  - **Work** — document collaboration: clarify before starting, docs-only file boundary, execution autonomy tiers, and delivery approval
  - **Code** — TypeScript tool orchestration with 8-way concurrent sub-calls and hard timeouts
- **71 built-in tools** — Bash, file read/write/edit, search, terminal (PTY / Terminal\* six-pack), SSH, LSP, NotebookEdit, Cron, Git, workflows, and more
- **Professional document skills** — read and generate Word (.docx), Excel (.xlsx), PowerPoint (.pptx), and PDF (with embedded CJK fonts)
- **Cloud connectors** — Slack, Google Drive, and Notion with locally encrypted tokens
- **Multi-agent scheduling** — priority queue, sub-agents, plan approval, goal mode, background and scheduled tasks
- **Security & permissions** — four autonomy presets, named permission profiles, native sandboxing (Windows / Linux / macOS), read-before-write, and file-level undo
- **Provenance-grounded memory** — evidence-before-belief long-term memory (Eywa + MAP-Graph), plus AGORA step compression, SWE-Touch drift detection, approval-fatigue guard, tool-inertia prediction, and skill gating
- **Terminal & remote** — dockable terminal drawer, persistent PTY sessions, SSH key auth, background command tasks
- **Extensibility** — MCP protocol client, plugin system, TypeScript / Python SDK, headless CLI, and ACP service
- **Desktop experience** — local account with avatar, dark / light themes, Chinese & English UI, Windows 11 Acrylic sidebar, and a live test-coverage report

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron 43, frameless window, `contextIsolation: true` |
| Frontend | React 18 + TypeScript 5.5 + Vite 7 |
| UI | Ant Design 5 with custom dark / light themes |
| State | Zustand 4 (main-process authoritative) |
| AI API | axios SSE streaming, DeepSeek / OpenAI / Anthropic compatible |
| Storage | JSONL event logs + SQLite projection cache + FTS5 + long-term memory |
| Build | Vite + electron-builder (NSIS / DMG / AppImage) |

## Releases

- [Auraxis v3.0.0](https://github.com/yth1120/Auraxis-Agent/releases/tag/v3.0.0) — current release
- [Auraxis v2.0.0](https://github.com/yth1120/Auraxis-Agent/releases/tag/v2.0.0)
- [DeepFlow v1.3.0 / v1.2.0 / v1.1.1 / v1.1.0](https://github.com/yth1120/Auraxis-Agent/releases) — archived predecessor releases

Installers are available for Windows (NSIS), macOS (DMG, x64 + arm64), and Linux (AppImage).

## Quality

- Unit tests: 235 test files / 1,734 cases passing (+3 environment-skips)
- Coverage: 85.43% lines / 79.03% branches / 86.61% functions
- E2E (real Electron via Playwright): 15/15 passing

## Documentation

- [Architecture & development docs (English)](docs/README.md)
- [Architecture & development docs (中文)](docs/README.zh-CN.md)
- [Changelog](CHANGELOG.md)
- [Engineering conventions (中文)](AGENTS.md)
- [TypeScript SDK](packages/auraxis-sdk/README.md) · [Python SDK](python/auraxis_sdk/README.md)

## License

MIT
