# Anything Analyzer

Universal web protocol analyzer — 一款内嵌浏览器的桌面应用，通过 Chrome DevTools Protocol 实时捕获网络请求、JS Hook、存储变化，并借助 AI 进行智能协议分析。

![Electron](https://img.shields.io/badge/Electron-35-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **内嵌浏览器** — 多标签页浏览器，支持弹窗自动捕获为内部标签（OAuth 流程友好）
- **全量网络抓包** — 基于 CDP Fetch 拦截，捕获所有 HTTP 请求/响应（含 headers、body）
- **SSE / WebSocket 识别** — 自动检测流式通信和 WebSocket 升级请求并标记
- **JS Hook 注入** — 拦截 `fetch`、`XMLHttpRequest`、`crypto.subtle`、`document.cookie` 调用
- **存储快照** — 定时采集 Cookie、localStorage、sessionStorage 变化
- **AI 智能分析** — 场景预分类 + 鉴权链提取 + 通用协议分析（支持 OpenAI / Anthropic / 自定义 LLM）
- **暗色主题** — 基于 Ant Design 的现代暗色界面

## Screenshots
<img width="2554" height="1400" alt="image" src="https://github.com/user-attachments/assets/87f24186-ea00-4a03-9634-4d7af4b224d4" />


## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 35 + electron-vite |
| Frontend | React 19 + Ant Design 5 + TypeScript |
| Database | better-sqlite3 (local SQLite) |
| Protocol | Chrome DevTools Protocol (CDP) |
| AI | OpenAI / Anthropic / Custom LLM API |

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **pnpm** (recommended) or npm
- Visual Studio Build Tools (Windows, for native module compilation)

### Install

```bash
git clone https://github.com/MouseWW/anything-analyzer.git
cd anything-analyzer
pnpm install
```

### Development

```bash
pnpm dev
```

### Build

```bash
# Build distributable
pnpm build

# Package as installer (Windows .exe)
pnpm run build && npx electron-builder --win
```

### Test

```bash
pnpm test
```

## Usage

1. **Create Session** — 点击左下角 "New Session"，输入名称和目标 URL
2. **Browse** — 在内嵌浏览器中操作目标网站（支持多标签页）
3. **Capture** — 点击 "Start Capture" 开始抓包，所有网络请求实时展示
4. **Analyze** — 停止捕获后点击 "Analyze"，AI 生成协议分析报告

### LLM Configuration

点击左下角 Settings 配置 LLM Provider：
- **OpenAI** — 填入 API Key 和 Model（如 `gpt-4o`）
- **Anthropic** — 填入 API Key 和 Model（如 `claude-sonnet-4-20250514`）
- **Custom** — 任何 OpenAI 兼容的 API（填入 Base URL）

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── ai/                  # AI analysis pipeline
│   │   ├── ai-analyzer.ts   #   orchestrator
│   │   ├── data-assembler.ts #  data preparation
│   │   ├── prompt-builder.ts #  prompt generation
│   │   └── scene-detector.ts #  rule-based scene classification
│   ├── capture/             # Capture engine
│   │   ├── capture-engine.ts #  data sink → SQLite + renderer
│   │   ├── js-injector.ts   #   hook script injection
│   │   └── storage-collector.ts # periodic storage snapshots
│   ├── cdp/
│   │   └── cdp-manager.ts   # Chrome DevTools Protocol manager
│   ├── db/                  # SQLite database layer
│   ├── session/
│   │   └── session-manager.ts # session lifecycle + per-tab capture
│   ├── tab-manager.ts       # Multi-tab WebContentsView management
│   ├── window.ts            # Main window + layout management
│   └── ipc.ts               # IPC handler registration
├── preload/                 # Context bridge + hook script
├── renderer/                # React UI
│   ├── components/          # UI components
│   │   ├── TabBar.tsx       #   browser tab bar
│   │   ├── BrowserPanel.tsx #   address bar + navigation
│   │   ├── ControlBar.tsx   #   capture controls
│   │   ├── RequestLog.tsx   #   request list table
│   │   ├── ReportView.tsx   #   AI analysis report
│   │   └── ...
│   └── hooks/               # React hooks
└── shared/
    └── types.ts             # Shared type definitions
```
---

Finally，Thanks to everyone on LinuxDo for their support! Welcome to join https://linux.do/ for all kinds of technical exchanges, cutting-edge AI information, and AI experience sharing, all on Linuxdo!

---

## License

MIT
