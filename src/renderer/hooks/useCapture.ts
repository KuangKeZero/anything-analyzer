import { useState, useEffect, useCallback, useRef } from "react";
import type {
  CapturedRequest,
  JsHookRecord,
  StorageSnapshot,
  AnalysisReport,
} from "@shared/types";
import { IPC_CHANNELS } from "@shared/types";

interface UseCaptureState {
  requests: CapturedRequest[];
  hooks: JsHookRecord[];
  snapshots: StorageSnapshot[];
  reports: AnalysisReport[];
  isAnalyzing: boolean;
  analysisError: string | null;
  streamingContent: string;
  selectedRequest: CapturedRequest | null;
}

interface UseCaptureReturn extends UseCaptureState {
  loadData: (sessionId: string) => Promise<void>;
  clearData: () => void;
  selectRequest: (request: CapturedRequest | null) => void;
  startAnalysis: (sessionId: string, purpose?: string) => Promise<void>;
}

const INITIAL_STATE: UseCaptureState = {
  requests: [],
  hooks: [],
  snapshots: [],
  reports: [],
  isAnalyzing: false,
  analysisError: null,
  streamingContent: "",
  selectedRequest: null,
};

export function useCapture(sessionId: string | null): UseCaptureReturn {
  const [state, setState] = useState<UseCaptureState>(INITIAL_STATE);
  const sessionIdRef = useRef(sessionId);

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Clear all data
  const clearData = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // Select a request for detail view
  const selectRequest = useCallback((request: CapturedRequest | null) => {
    setState((prev) => ({ ...prev, selectedRequest: request }));
  }, []);

  // Load all data for a session from main process
  const loadData = useCallback(async (sid: string) => {
    try {
      const [requests, hooks, snapshots, reports] = await Promise.all([
        window.electronAPI.getRequests(sid),
        window.electronAPI.getHooks(sid),
        window.electronAPI.getStorage(sid),
        window.electronAPI.getReports(sid),
      ]);

      // Only update if session hasn't changed while loading
      if (sessionIdRef.current === sid) {
        setState((prev) => ({
          ...prev,
          requests: requests.sort((a, b) => a.sequence - b.sequence),
          hooks: hooks.sort((a, b) => b.timestamp - a.timestamp),
          snapshots,
          reports: reports.sort((a, b) => b.created_at - a.created_at),
        }));
      }
    } catch (err) {
      console.error("Failed to load capture data:", err);
    }
  }, []);

  // Start AI analysis for a session
  const startAnalysis = useCallback(async (sid: string, purpose?: string) => {
    setState((prev) => ({
      ...prev,
      isAnalyzing: true,
      analysisError: null,
      streamingContent: "",
    }));

    try {
      const report = await window.electronAPI.startAnalysis(sid, purpose);

      // Only update if session hasn't changed
      if (sessionIdRef.current === sid) {
        setState((prev) => ({
          ...prev,
          isAnalyzing: false,
          streamingContent: "",
          reports: [report, ...prev.reports],
        }));
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (sessionIdRef.current === sid) {
        setState((prev) => ({
          ...prev,
          isAnalyzing: false,
          streamingContent: "",
          analysisError: errMsg,
        }));
      }
    }
  }, []);

  // Set up IPC event listeners for real-time updates
  useEffect(() => {
    if (!sessionId) {
      clearData();
      return;
    }

    // Load initial data
    loadData(sessionId);

    // Listen for new captured requests
    const handleRequest = (data: CapturedRequest) => {
      if (data.session_id !== sessionIdRef.current) return;
      setState((prev) => ({
        ...prev,
        requests: [...prev.requests, data],
      }));
    };

    // Listen for new hook records
    const handleHook = (data: JsHookRecord) => {
      if (data.session_id !== sessionIdRef.current) return;
      setState((prev) => ({
        ...prev,
        hooks: [data, ...prev.hooks],
      }));
    };

    // Listen for analysis progress (streaming chunks)
    const handleAnalysisProgress = (chunk: string) => {
      setState((prev) => ({
        ...prev,
        streamingContent: prev.streamingContent + chunk,
      }));
    };

    window.electronAPI.onRequestCaptured(handleRequest);
    window.electronAPI.onHookCaptured(handleHook);
    window.electronAPI.onAnalysisProgress(handleAnalysisProgress);

    // Cleanup listeners on unmount or session change
    return () => {
      window.electronAPI.removeAllListeners(IPC_CHANNELS.CAPTURE_REQUEST);
      window.electronAPI.removeAllListeners(IPC_CHANNELS.CAPTURE_HOOK);
      window.electronAPI.removeAllListeners(IPC_CHANNELS.AI_PROGRESS);
    };
  }, [sessionId, loadData, clearData]);

  return {
    ...state,
    loadData,
    clearData,
    selectRequest,
    startAnalysis,
  };
}

export default useCapture;
