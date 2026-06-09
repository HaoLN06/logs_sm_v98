/// <reference lib="webworker" />

import { parseLogs } from "@/lib/log-parser";

self.onmessage = (event: MessageEvent<{ files: { text: string; name: string; size: number }[] }>) => {
  try {
    self.postMessage({ result: parseLogs(event.data.files) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Không thể phân tích file log." });
  }
};
