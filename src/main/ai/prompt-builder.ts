import type {
  AssembledData,
  SceneHint,
  AuthChainItem,
  FilteredRequest,
} from "@shared/types";

interface PromptMessages {
  system: string;
  user: string;
}

const REVERSE_API_REQUIREMENTS = `1. 完整 API 端点清单：列出所有 API 的方法、路径、请求参数、响应 JSON 结构
2. 鉴权流程：Token/Cookie 获取、刷新、传递机制的完整链路
3. 请求依赖链：哪些请求的响应是后续请求的必要输入
4. 数据模型推断：从 API 响应结构推断后端数据模型
5. 复现代码：用 Python requests 库写出可直接运行的完整 API 调用流程`;

const SECURITY_AUDIT_REQUIREMENTS = `1. 认证安全：分析认证方式的安全性，是否存在弱口令、明文传输、Token 泄露风险
2. 敏感数据暴露：检查响应中是否包含不必要的敏感信息（密码、密钥、PII）
3. CSRF/XSS 风险：分析请求是否缺少 CSRF Token，响应头是否缺少安全头（CSP, X-Frame-Options 等）
4. 权限控制：分析是否存在越权访问的可能（水平/垂直越权）
5. 安全建议：针对发现的问题给出具体修复建议`;

const PERFORMANCE_REQUIREMENTS = `1. 请求时序分析：分析请求的串行/并行关系，识别阻塞链路
2. 冗余请求：识别重复或不必要的请求
3. 资源优化：分析资源加载顺序，识别可优化的静态资源
4. 缓存策略：分析 Cache-Control、ETag 等缓存头的使用情况
5. 性能建议：给出具体的性能优化建议和预期收益`;

const DEFAULT_REQUIREMENTS = `1. 场景识别：判断用户执行了什么操作（注册、登录、AI对话、支付等）
2. 交互流程概述：按时间顺序描述完整交互链路
3. API端点清单：列出所有关键API，标注方法、路径、用途
4. 鉴权机制分析：认证方式、凭据获取流程、凭据传递方式
5. 流式通信分析（如检测到SSE/WebSocket）：协议类型、端点、请求/响应格式
6. 存储使用分析：Cookie/localStorage/sessionStorage 的关键变化
7. 关键依赖关系：请求之间的依赖和时序关系
8. 复现建议：用代码伪逻辑描述如何复现整个流程`;

/**
 * PromptBuilder — Builds the analysis prompt from assembled data.
 */
export class PromptBuilder {
  build(
    data: AssembledData,
    platformName: string,
    purpose?: string,
  ): PromptMessages {
    const system = `你是一位网站协议分析专家。你的任务是分析用户在网站上的操作过程中产生的HTTP请求、JS调用和存储变化，识别其业务场景，并生成结构化的协议分析报告。Be precise and technical. Output in Chinese (Simplified).`;

    const analysisRequirements = this.buildAnalysisRequirements(purpose);
    const requestsSection = this.formatRequests(data.requests);
    const hooksSection = this.formatHooks(data.requests);
    const storageSection = this.formatStorageDiff(data.storageDiff);
    const sceneSection = this.formatSceneHints(data.sceneHints);
    const authSection = this.formatAuthChain(data.authChain);
    const streamingSection = this.formatStreamingRequests(
      data.streamingRequests,
    );

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
${analysisRequirements}`;

    return { system, user };
  }

  private buildAnalysisRequirements(purpose?: string): string {
    if (!purpose || purpose === "auto") {
      return DEFAULT_REQUIREMENTS;
    }

    const predefinedMap: Record<string, string> = {
      "reverse-api": REVERSE_API_REQUIREMENTS,
      "security-audit": SECURITY_AUDIT_REQUIREMENTS,
      performance: PERFORMANCE_REQUIREMENTS,
    };

    if (predefinedMap[purpose]) {
      return predefinedMap[purpose];
    }

    return `用户指定的分析重点：${purpose}

在完成上述重点分析的同时，也请覆盖以下基础分析：
${DEFAULT_REQUIREMENTS}`;
  }

  private formatSceneHints(hints: SceneHint[]): string {
    if (hints.length === 0) return "(无场景线索)";
    return hints
      .map((h) => `- **${h.scene}** [${h.confidence}]: ${h.evidence}`)
      .join("\n");
  }

  private formatAuthChain(chain: AuthChainItem[]): string {
    if (chain.length === 0) return "(无鉴权数据)";
    return chain
      .map((a) => {
        const consumers =
          a.consumers.length > 0 ? `\n  使用者: ${a.consumers.join(", ")}` : "";
        return `- **${a.credentialType}** (来源: ${a.source})${consumers}`;
      })
      .join("\n");
  }

  private formatStreamingRequests(requests: FilteredRequest[]): string {
    if (requests.length === 0) return "(无流式通信)";
    return requests.map((r) => `- #${r.seq} ${r.method} ${r.url}`).join("\n");
  }

  private formatRequests(requests: AssembledData["requests"]): string {
    if (requests.length === 0) return "(无请求记录)";
    return requests
      .map((r) => {
        const lines: string[] = [
          `#${r.seq} ${r.method} ${r.url} → ${r.status || "pending"}`,
        ];
        const important = this.filterHeaders(r.headers);
        if (Object.keys(important).length > 0)
          lines.push(`  Headers: ${JSON.stringify(important)}`);
        if (r.body)
          lines.push(
            `  Body: ${r.body.length > 2000 ? r.body.substring(0, 2000) + "..." : r.body}`,
          );
        if (r.responseBody)
          lines.push(
            `  Response: ${r.responseBody.length > 2000 ? r.responseBody.substring(0, 2000) + "..." : r.responseBody}`,
          );
        return lines.join("\n");
      })
      .join("\n\n");
  }

  private formatHooks(requests: AssembledData["requests"]): string {
    const allHooks = requests.flatMap((r) => r.hooks);
    if (allHooks.length === 0) return "(无 JS Hook 记录)";
    return allHooks
      .map(
        (h) =>
          `[${h.hook_type}] ${h.function_name}: args=${h.arguments}${h.result ? ` result=${h.result}` : ""}`,
      )
      .join("\n");
  }

  private formatStorageDiff(diff: AssembledData["storageDiff"]): string {
    const sections: string[] = [];
    for (const [type, d] of Object.entries(diff)) {
      const parts: string[] = [];
      if (Object.keys(d.added).length > 0)
        parts.push(
          `  新增: ${Object.entries(d.added)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`,
        );
      if (Object.keys(d.changed).length > 0)
        parts.push(
          `  变更: ${Object.entries(d.changed)
            .map(([k, v]) => `${k}: "${v.old}" → "${v.new}"`)
            .join(", ")}`,
        );
      if (d.removed.length > 0) parts.push(`  删除: ${d.removed.join(", ")}`);
      if (parts.length > 0) sections.push(`${type}:\n${parts.join("\n")}`);
    }
    return sections.length > 0 ? sections.join("\n\n") : "(无存储变化)";
  }

  private filterHeaders(
    headers: Record<string, string>,
  ): Record<string, string> {
    const important = [
      "authorization",
      "x-token",
      "x-csrf-token",
      "x-request-id",
      "x-signature",
      "content-type",
      "cookie",
      "referer",
      "origin",
      "user-agent",
    ];
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (important.includes(key.toLowerCase())) result[key] = value;
    }
    return result;
  }
}
