# Custom Analysis Purpose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to select a predefined analysis scenario or provide custom analysis instructions before triggering AI analysis.

**Architecture:** A new `purpose?: string` parameter threads through the entire call chain from ControlBar UI → App → useCapture → preload → IPC → AiAnalyzer → PromptBuilder. PromptBuilder conditionally replaces the `## 分析要求` section based on the purpose value. A shared constant `ANALYSIS_PURPOSES` provides the predefined options for UI rendering.

**Tech Stack:** React 19, Ant Design 5 (Select, Modal, Input.TextArea), TypeScript, Electron IPC, Vitest

---

### Task 1: Add `ANALYSIS_PURPOSES` Constant and Update `ElectronAPI` Type

**Files:**
- Modify: `src/shared/types.ts:168-263`

- [ ] **Step 1: Add the `ANALYSIS_PURPOSES` constant**

Add the following after the `AssembledData` interface (before `// ---- IPC Channel Names ----`, around line 167):

```typescript
// ---- Analysis Purpose ----

export const ANALYSIS_PURPOSES = [
  { label: '自动识别', value: 'auto', description: '默认 — AI 自动检测场景并生成通用分析' },
  { label: '逆向 API 协议', value: 'reverse-api', description: '聚焦 API 端点、请求/响应模式、鉴权流程、数据模型、复现代码' },
  { label: '安全审计', value: 'security-audit', description: '聚焦认证安全、敏感数据暴露、CSRF/XSS 风险、权限控制' },
  { label: '性能分析', value: 'performance', description: '聚焦请求时序、冗余请求、资源加载、缓存策略' },
  { label: '自定义...', value: 'custom', description: '输入自定义分析指令' },
] as const;

export type AnalysisPurposeId = (typeof ANALYSIS_PURPOSES)[number]['value'];
```

- [ ] **Step 2: Update `ElectronAPI.startAnalysis` signature**

Change the `startAnalysis` method in the `ElectronAPI` interface from:

```typescript
startAnalysis: (sessionId: string) => Promise<AnalysisReport>;
```

to:

```typescript
startAnalysis: (sessionId: string, purpose?: string) => Promise<AnalysisReport>;
```

- [ ] **Step 3: Run type check to verify no compile errors**

Run: `cd anything-register && npx tsc --noEmit`
Expected: No errors (the new optional parameter is backward compatible)

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add ANALYSIS_PURPOSES constant and update ElectronAPI type"
```

---

### Task 2: Update PromptBuilder to Accept Purpose and Build Conditional Prompts

**Files:**
- Modify: `src/main/ai/prompt-builder.ts:1-108`
- Create: `tests/main/ai/prompt-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/ai/prompt-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { PromptBuilder } from '../../../src/main/ai/prompt-builder'
import type { AssembledData } from '../../../src/shared/types'

// Minimal fixture to satisfy PromptBuilder
function createMinimalData(): AssembledData {
  return {
    requests: [{
      seq: 1,
      method: 'GET',
      url: 'https://example.com/api/test',
      headers: { 'content-type': 'application/json' },
      body: null,
      status: 200,
      responseHeaders: null,
      responseBody: '{"ok":true}',
      hooks: []
    }],
    storageDiff: {
      cookies: { added: {}, changed: {}, removed: [] },
      localStorage: { added: {}, changed: {}, removed: [] },
      sessionStorage: { added: {}, changed: {}, removed: [] }
    },
    estimatedTokens: 100,
    sceneHints: [],
    streamingRequests: [],
    authChain: []
  }
}

describe('PromptBuilder', () => {
  const builder = new PromptBuilder()
  const data = createMinimalData()
  const platform = 'example.com'

  describe('purpose=undefined (default)', () => {
    it('should include default 8 analysis requirements', () => {
      const { user } = builder.build(data, platform)
      expect(user).toContain('场景识别')
      expect(user).toContain('交互流程概述')
      expect(user).toContain('API端点清单')
      expect(user).toContain('鉴权机制分析')
      expect(user).toContain('流式通信分析')
      expect(user).toContain('存储使用分析')
      expect(user).toContain('关键依赖关系')
      expect(user).toContain('复现建议')
    })
  })

  describe('purpose="auto"', () => {
    it('should produce identical output to undefined', () => {
      const defaultResult = builder.build(data, platform)
      const autoResult = builder.build(data, platform, 'auto')
      expect(autoResult.system).toBe(defaultResult.system)
      expect(autoResult.user).toBe(defaultResult.user)
    })
  })

  describe('purpose="" (empty string)', () => {
    it('should produce identical output to undefined', () => {
      const defaultResult = builder.build(data, platform)
      const emptyResult = builder.build(data, platform, '')
      expect(emptyResult.system).toBe(defaultResult.system)
      expect(emptyResult.user).toBe(defaultResult.user)
    })
  })

  describe('purpose="reverse-api"', () => {
    it('should replace analysis requirements with reverse-api specific ones', () => {
      const { user } = builder.build(data, platform, 'reverse-api')
      expect(user).toContain('完整 API 端点清单')
      expect(user).toContain('鉴权流程')
      expect(user).toContain('请求依赖链')
      expect(user).toContain('数据模型推断')
      expect(user).toContain('复现代码')
      // Should NOT contain default requirements
      expect(user).not.toContain('场景识别：判断用户执行了什么操作')
    })
  })

  describe('purpose="security-audit"', () => {
    it('should replace analysis requirements with security-specific ones', () => {
      const { user } = builder.build(data, platform, 'security-audit')
      expect(user).toContain('认证安全')
      expect(user).toContain('敏感数据暴露')
      expect(user).toContain('CSRF/XSS 风险')
      expect(user).toContain('权限控制')
      expect(user).toContain('安全建议')
      expect(user).not.toContain('场景识别：判断用户执行了什么操作')
    })
  })

  describe('purpose="performance"', () => {
    it('should replace analysis requirements with performance-specific ones', () => {
      const { user } = builder.build(data, platform, 'performance')
      expect(user).toContain('请求时序分析')
      expect(user).toContain('冗余请求')
      expect(user).toContain('资源优化')
      expect(user).toContain('缓存策略')
      expect(user).toContain('性能建议')
      expect(user).not.toContain('场景识别：判断用户执行了什么操作')
    })
  })

  describe('purpose=custom text', () => {
    it('should prepend custom purpose and keep default requirements as baseline', () => {
      const customText = '分析用户注册流程中的所有加密操作'
      const { user } = builder.build(data, platform, customText)
      expect(user).toContain('用户指定的分析重点：分析用户注册流程中的所有加密操作')
      expect(user).toContain('在完成上述重点分析的同时，也请覆盖以下基础分析')
      // Default requirements should still be present
      expect(user).toContain('场景识别')
    })

    it('should not alter the system prompt for custom text', () => {
      const defaultResult = builder.build(data, platform)
      const customResult = builder.build(data, platform, '自定义分析')
      expect(customResult.system).toBe(defaultResult.system)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd anything-register && npx vitest run tests/main/ai/prompt-builder.test.ts`
Expected: FAIL — `build()` does not accept a third parameter yet, and default tests may pass but purpose-specific tests will fail.

- [ ] **Step 3: Implement purpose-based prompt generation in PromptBuilder**

Modify `src/main/ai/prompt-builder.ts`. Change the `build` method signature and add purpose-specific requirements:

```typescript
import type { AssembledData, SceneHint, AuthChainItem, FilteredRequest } from '@shared/types'

interface PromptMessages { system: string; user: string }

const REVERSE_API_REQUIREMENTS = `1. 完整 API 端点清单：列出所有 API 的方法、路径、请求参数、响应 JSON 结构
2. 鉴权流程：Token/Cookie 获取、刷新、传递机制的完整链路
3. 请求依赖链：哪些请求的响应是后续请求的必要输入
4. 数据模型推断：从 API 响应结构推断后端数据模型
5. 复现代码：用 Python requests 库写出可直接运行的完整 API 调用流程`

const SECURITY_AUDIT_REQUIREMENTS = `1. 认证安全：分析认证方式的安全性，是否存在弱口令、明文传输、Token 泄露风险
2. 敏感数据暴露：检查响应中是否包含不必要的敏感信息（密码、密钥、PII）
3. CSRF/XSS 风险：分析请求是否缺少 CSRF Token，响应头是否缺少安全头（CSP, X-Frame-Options 等）
4. 权限控制：分析是否存在越权访问的可能（水平/垂直越权）
5. 安全建议：针对发现的问题给出具体修复建议`

const PERFORMANCE_REQUIREMENTS = `1. 请求时序分析：分析请求的串行/并行关系，识别阻塞链路
2. 冗余请求：识别重复或不必要的请求
3. 资源优化：分析资源加载顺序，识别可优化的静态资源
4. 缓存策略：分析 Cache-Control、ETag 等缓存头的使用情况
5. 性能建议：给出具体的性能优化建议和预期收益`

const DEFAULT_REQUIREMENTS = `1. 场景识别：判断用户执行了什么操作（注册、登录、AI对话、支付等）
2. 交互流程概述：按时间顺序描述完整交互链路
3. API端点清单：列出所有关键API，标注方法、路径、用途
4. 鉴权机制分析：认证方式、凭据获取流程、凭据传递方式
5. 流式通信分析（如检测到SSE/WebSocket）：协议类型、端点、请求/响应格式
6. 存储使用分析：Cookie/localStorage/sessionStorage 的关键变化
7. 关键依赖关系：请求之间的依赖和时序关系
8. 复现建议：用代码伪逻辑描述如何复现整个流程`

/**
 * PromptBuilder — Builds the analysis prompt from assembled data.
 */
export class PromptBuilder {
  build(data: AssembledData, platformName: string, purpose?: string): PromptMessages {
    const system = `你是一位网站协议分析专家。你的任务是分析用户在网站上的操作过程中产生的HTTP请求、JS调用和存储变化，识别其业务场景，并生成结构化的协议分析报告。Be precise and technical. Output in Chinese (Simplified).`

    const requestsSection = this.formatRequests(data.requests)
    const hooksSection = this.formatHooks(data.requests)
    const storageSection = this.formatStorageDiff(data.storageDiff)
    const sceneSection = this.formatSceneHints(data.sceneHints)
    const authSection = this.formatAuthChain(data.authChain)
    const streamingSection = this.formatStreamingRequests(data.streamingRequests)

    const analysisRequirements = this.buildAnalysisRequirements(purpose)

    const user = `以下是用户在 ${platformName} 上操作时的完整数据。

## 场景线索
${sceneSection}

## 鉴权链
${authSection}

## 流式通信
${streamingSection}

## 请求日志
${requestsSection}

## JS Hook 数据
${hooksSection}

## 存储变化
${storageSection}

## 分析要求
${analysisRequirements}`

    return { system, user }
  }

  private buildAnalysisRequirements(purpose?: string): string {
    // undefined, empty, or "auto" → default behavior
    if (!purpose || purpose === 'auto') {
      return DEFAULT_REQUIREMENTS
    }

    // Predefined scenarios
    const predefinedMap: Record<string, string> = {
      'reverse-api': REVERSE_API_REQUIREMENTS,
      'security-audit': SECURITY_AUDIT_REQUIREMENTS,
      'performance': PERFORMANCE_REQUIREMENTS,
    }

    if (predefinedMap[purpose]) {
      return predefinedMap[purpose]
    }

    // Custom text: prepend user's purpose + keep default as baseline
    return `用户指定的分析重点：${purpose}

在完成上述重点分析的同时，也请覆盖以下基础分析：
${DEFAULT_REQUIREMENTS}`
  }

  // ... all private format methods remain unchanged ...
```

Keep all the `private formatSceneHints`, `formatAuthChain`, `formatStreamingRequests`, `formatRequests`, `formatHooks`, `formatStorageDiff`, and `filterHeaders` methods exactly as they are. Only the `build()` method signature changes (adding `purpose?: string`), its body replaces the inline requirements string with `this.buildAnalysisRequirements(purpose)`, and a new private `buildAnalysisRequirements` method is added.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd anything-register && npx vitest run tests/main/ai/prompt-builder.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Run all existing tests to verify no regressions**

Run: `cd anything-register && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/prompt-builder.ts tests/main/ai/prompt-builder.test.ts
git commit -m "feat: purpose-based prompt generation in PromptBuilder with TDD"
```

---

### Task 3: Thread `purpose` Through AiAnalyzer and IPC Handler

**Files:**
- Modify: `src/main/ai/ai-analyzer.ts:22-44`
- Modify: `src/main/ipc.ts:185-197`

- [ ] **Step 1: Update AiAnalyzer.analyze to accept `purpose?`**

In `src/main/ai/ai-analyzer.ts`, change the `analyze` method signature and the `promptBuilder.build` call:

Change:
```typescript
  async analyze(
    sessionId: string,
    config: LLMProviderConfig,
    onProgress?: (chunk: string) => void
  ): Promise<AnalysisReport> {
```

To:
```typescript
  async analyze(
    sessionId: string,
    config: LLMProviderConfig,
    onProgress?: (chunk: string) => void,
    purpose?: string
  ): Promise<AnalysisReport> {
```

And change line 44:
```typescript
    const { system, user } = promptBuilder.build(data, platformName)
```

To:
```typescript
    const { system, user } = promptBuilder.build(data, platformName, purpose)
```

- [ ] **Step 2: Update IPC handler to thread `purpose`**

In `src/main/ipc.ts`, change the `ai:analyze` handler (around line 185):

Change:
```typescript
  ipcMain.handle("ai:analyze", async (_event, sessionId: string) => {
    const config = loadLLMConfig();
    if (!config) throw new Error("LLM provider not configured");

    const win = windowManager.getMainWindow();
    const onProgress = win
      ? (chunk: string) => {
          win.webContents.send("ai:progress", chunk);
        }
      : undefined;

    return aiAnalyzer.analyze(sessionId, config, onProgress);
  });
```

To:
```typescript
  ipcMain.handle("ai:analyze", async (_event, sessionId: string, purpose?: string) => {
    const config = loadLLMConfig();
    if (!config) throw new Error("LLM provider not configured");

    const win = windowManager.getMainWindow();
    const onProgress = win
      ? (chunk: string) => {
          win.webContents.send("ai:progress", chunk);
        }
      : undefined;

    return aiAnalyzer.analyze(sessionId, config, onProgress, purpose);
  });
```

- [ ] **Step 3: Run type check**

Run: `cd anything-register && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `cd anything-register && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/ai-analyzer.ts src/main/ipc.ts
git commit -m "feat: thread purpose parameter through AiAnalyzer and IPC handler"
```

---

### Task 4: Update Preload Bridge and useCapture Hook

**Files:**
- Modify: `src/preload/index.ts:55-56`
- Modify: `src/renderer/hooks/useCapture.ts:84-116`

- [ ] **Step 1: Update preload bridge to pass `purpose`**

In `src/preload/index.ts`, change the `startAnalysis` line (line 55-56):

Change:
```typescript
  startAnalysis: (sessionId: string) =>
    ipcRenderer.invoke("ai:analyze", sessionId),
```

To:
```typescript
  startAnalysis: (sessionId: string, purpose?: string) =>
    ipcRenderer.invoke("ai:analyze", sessionId, purpose),
```

- [ ] **Step 2: Update `useCapture.startAnalysis` to accept and pass `purpose`**

In `src/renderer/hooks/useCapture.ts`, change the `startAnalysis` callback (around line 84):

Change:
```typescript
  const startAnalysis = useCallback(async (sid: string) => {
    setState((prev) => ({
      ...prev,
      isAnalyzing: true,
      analysisError: null,
      streamingContent: ''
    }))

    try {
      const report = await window.electronAPI.startAnalysis(sid)
```

To:
```typescript
  const startAnalysis = useCallback(async (sid: string, purpose?: string) => {
    setState((prev) => ({
      ...prev,
      isAnalyzing: true,
      analysisError: null,
      streamingContent: ''
    }))

    try {
      const report = await window.electronAPI.startAnalysis(sid, purpose)
```

Also update the `UseCaptureReturn` interface (around line 25):

Change:
```typescript
  startAnalysis: (sessionId: string) => Promise<void>
```

To:
```typescript
  startAnalysis: (sessionId: string, purpose?: string) => Promise<void>
```

- [ ] **Step 3: Run type check**

Run: `cd anything-register && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/hooks/useCapture.ts
git commit -m "feat: thread purpose through preload bridge and useCapture hook"
```

---

### Task 5: Add Purpose Selector UI to ControlBar

**Files:**
- Modify: `src/renderer/components/ControlBar.tsx`

- [ ] **Step 1: Add purpose state and selector to ControlBar**

Replace the entire `src/renderer/components/ControlBar.tsx` with:

```tsx
import React, { useState } from 'react'
import { Button, Input, Modal, Select, Space, Spin, Tag } from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ExperimentOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import type { SessionStatus } from '../../shared/types'
import { ANALYSIS_PURPOSES } from '../../shared/types'

interface ControlBarProps {
  status: SessionStatus | null
  onStart: () => void
  onPause: () => void
  onStop: () => void
  onAnalyze: (purpose?: string) => void
  hasRequests: boolean
  isAnalyzing?: boolean
}

const ControlBar: React.FC<ControlBarProps> = ({
  status,
  onStart,
  onPause,
  onStop,
  onAnalyze,
  hasRequests,
  isAnalyzing = false
}) => {
  const [purposeId, setPurposeId] = useState<string>('auto')
  const [customText, setCustomText] = useState('')
  const [customModalOpen, setCustomModalOpen] = useState(false)

  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isStopped = status === 'stopped' || status === null

  const handlePurposeChange = (value: string) => {
    if (value === 'custom') {
      setCustomModalOpen(true)
    } else {
      setPurposeId(value)
    }
  }

  const handleCustomConfirm = () => {
    const trimmed = customText.trim()
    if (trimmed) {
      setPurposeId('custom')
      setCustomModalOpen(false)
    }
  }

  const handleCustomCancel = () => {
    setCustomModalOpen(false)
    // Revert to previous selection if custom was never confirmed
    if (purposeId !== 'custom') {
      // No change needed, purposeId still holds previous value
    }
  }

  const handleAnalyze = () => {
    if (purposeId === 'custom') {
      onAnalyze(customText.trim() || undefined)
    } else if (purposeId === 'auto') {
      onAnalyze(undefined)
    } else {
      onAnalyze(purposeId)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: '#1a1a1a',
        borderBottom: '1px solid #303030'
      }}
    >
      <Space size={8}>
        {/* Start button */}
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          disabled={!isStopped}
          onClick={onStart}
          style={
            isStopped
              ? { background: '#389e0d', borderColor: '#389e0d' }
              : undefined
          }
        >
          Start Capture
        </Button>

        {/* Pause button */}
        <Button
          icon={<PauseCircleOutlined />}
          disabled={!isRunning}
          onClick={onPause}
          style={
            isRunning
              ? { color: '#faad14', borderColor: '#faad14' }
              : undefined
          }
        >
          Pause
        </Button>

        {/* Stop button */}
        <Button
          danger
          icon={<StopOutlined />}
          disabled={!(isRunning || isPaused)}
          onClick={onStop}
        >
          Stop
        </Button>

        {/* Purpose selector */}
        <Select
          value={purposeId}
          onChange={handlePurposeChange}
          style={{ width: 160 }}
          disabled={isAnalyzing}
          options={ANALYSIS_PURPOSES.map(p => ({
            label: p.label,
            value: p.value,
          }))}
        />

        {/* Analyze button */}
        <Button
          type="primary"
          icon={<ExperimentOutlined />}
          disabled={!(isStopped && hasRequests) || isAnalyzing}
          loading={isAnalyzing}
          onClick={handleAnalyze}
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze'}
        </Button>
      </Space>

      {/* Status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {purposeId === 'custom' && customText.trim() && (
          <Tag color="blue" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {customText.trim()}
          </Tag>
        )}
        {isRunning && (
          <Tag
            color="green"
            icon={<Spin indicator={<LoadingOutlined style={{ fontSize: 12 }} spin />} size="small" />}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Capturing...
          </Tag>
        )}
        {isPaused && <Tag color="warning">Paused</Tag>}
        {isStopped && status !== null && <Tag color="default">Stopped</Tag>}
      </div>

      {/* Custom purpose modal */}
      <Modal
        title="自定义分析目的"
        open={customModalOpen}
        onOk={handleCustomConfirm}
        onCancel={handleCustomCancel}
        okText="确认"
        cancelText="取消"
        okButtonProps={{ disabled: !customText.trim() }}
      >
        <Input.TextArea
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="输入你希望 AI 重点分析的内容，例如：分析用户注册流程中的所有加密操作"
          autoSize={{ minRows: 3, maxRows: 8 }}
          maxLength={500}
          showCount
        />
      </Modal>
    </div>
  )
}

export default ControlBar
```

- [ ] **Step 2: Run type check**

Run: `cd anything-register && npx tsc --noEmit`
Expected: Errors in `App.tsx` because `handleAnalyze` doesn't accept `purpose` yet. This is expected — Task 6 fixes it.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ControlBar.tsx
git commit -m "feat: add analysis purpose selector to ControlBar"
```

---

### Task 6: Wire Purpose Through App.tsx and ReportView

**Files:**
- Modify: `src/renderer/App.tsx:148-152, 281-289, 324-332`
- Modify: `src/renderer/components/ReportView.tsx:17-22, 102-108, 173, 209-215`

- [ ] **Step 1: Update `handleAnalyze` in App.tsx to accept and pass `purpose`**

In `src/renderer/App.tsx`, add a state for purpose and update `handleAnalyze`:

Add state (after line 59, `const [activeTab, setActiveTab] = useState('requests')`):
```typescript
  const [analysisPurpose, setAnalysisPurpose] = useState<string | undefined>(undefined)
```

Change the `handleAnalyze` callback (around line 148):

From:
```typescript
  const handleAnalyze = useCallback(async () => {
    if (!currentSessionId) return
    setActiveTab('report')
    await startAnalysis(currentSessionId)
  }, [currentSessionId, startAnalysis])
```

To:
```typescript
  const handleAnalyze = useCallback(async (purpose?: string) => {
    if (!currentSessionId) return
    setAnalysisPurpose(purpose)
    setActiveTab('report')
    await startAnalysis(currentSessionId, purpose)
  }, [currentSessionId, startAnalysis])
```

- [ ] **Step 2: Update ControlBar props in JSX**

The `ControlBar` component usage (around line 281) already has `onAnalyze={handleAnalyze}`. Since `handleAnalyze` now accepts `(purpose?: string)` and `ControlBar.onAnalyze` passes `(purpose?: string)`, this is already compatible. No JSX change needed for ControlBar.

- [ ] **Step 3: Update ReportView to support purpose in re-analyze**

In `src/renderer/components/ReportView.tsx`, change the `onReAnalyze` prop type:

Change:
```typescript
interface ReportViewProps {
  report: AnalysisReport | null
  isAnalyzing: boolean
  analysisError: string | null
  streamingContent: string
  onReAnalyze: () => void
}
```

To:
```typescript
interface ReportViewProps {
  report: AnalysisReport | null
  isAnalyzing: boolean
  analysisError: string | null
  streamingContent: string
  onReAnalyze: (purpose?: string) => void
}
```

No other changes to ReportView — the existing `onClick={onReAnalyze}` will call with no arguments, which means `purpose=undefined`, equivalent to the same purpose used last time. This keeps the existing behavior intact.

- [ ] **Step 4: Update ReportView usage in App.tsx to pass handleAnalyze**

In `App.tsx`, in the report tab (around line 326), the existing code already has:
```tsx
onReAnalyze={handleAnalyze}
```

Since `handleAnalyze` now has the signature `(purpose?: string) => Promise<void>`, and `ReportViewProps.onReAnalyze` is `(purpose?: string) => void`, this is already compatible. No change needed.

- [ ] **Step 5: Run type check**

Run: `cd anything-register && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Run all tests**

Run: `cd anything-register && npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/ReportView.tsx
git commit -m "feat: wire purpose through App.tsx and ReportView for re-analyze support"
```

---

### Task 7: Final Integration Test

**Files:**
- No new files

- [ ] **Step 1: Run full test suite**

Run: `cd anything-register && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run type check on entire project**

Run: `cd anything-register && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run linter**

Run: `cd anything-register && npx eslint src/ --ext .ts,.tsx`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 4: Verify build**

Run: `cd anything-register && npx electron-vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit any linter fixes if needed**

```bash
git add -A
git commit -m "chore: lint fixes for custom analysis purpose feature"
```

(Only if there were linter-required changes. Skip if clean.)
