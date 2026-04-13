import { v4 as uuidv4 } from "uuid";
import type { AnalysisReport, LLMProviderConfig } from "@shared/types";
import type {
  SessionsRepo,
  RequestsRepo,
  JsHooksRepo,
  StorageSnapshotsRepo,
  AnalysisReportsRepo,
} from "../db/repositories";
import { DataAssembler } from "./data-assembler";
import { PromptBuilder } from "./prompt-builder";
import { LLMRouter } from "./llm-router";

/**
 * AiAnalyzer — Orchestrates data assembly, prompt building, LLM calling,
 * and report generation.
 */
export class AiAnalyzer {
  constructor(
    private sessionsRepo: SessionsRepo,
    private requestsRepo: RequestsRepo,
    private jsHooksRepo: JsHooksRepo,
    private storageSnapshotsRepo: StorageSnapshotsRepo,
    private reportsRepo: AnalysisReportsRepo,
  ) {}

  async analyze(
    sessionId: string,
    config: LLMProviderConfig,
    onProgress?: (chunk: string) => void,
    purpose?: string,
  ): Promise<AnalysisReport> {
    // Get session info
    const session = this.sessionsRepo.findById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Extract platform name from target URL
    let platformName = "unknown";
    try {
      platformName = new URL(session.target_url).hostname;
    } catch {
      /* ignore */
    }

    // Assemble data
    const assembler = new DataAssembler(
      this.requestsRepo,
      this.jsHooksRepo,
      this.storageSnapshotsRepo,
    );
    const data = assembler.assemble(sessionId);

    if (data.requests.length === 0) {
      throw new Error("No captured requests to analyze");
    }

    // Build prompt
    const promptBuilder = new PromptBuilder();
    const { system, user } = promptBuilder.build(data, platformName, purpose);

    // Call LLM with retry
    const router = new LLMRouter(config);
    let content = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await router.complete(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          onProgress,
        );
        content = result.content;
        promptTokens = result.promptTokens;
        completionTokens = result.completionTokens;
        break;
      } catch (err) {
        if (attempt === 1)
          throw new Error(
            `AI analysis failed after retry: ${(err as Error).message}`,
          );
      }
    }

    // Save report
    const report: AnalysisReport = {
      id: uuidv4(),
      session_id: sessionId,
      created_at: Date.now(),
      llm_provider: config.name,
      llm_model: config.model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      report_content: content,
    };

    this.reportsRepo.insert(report);

    return report;
  }
}
