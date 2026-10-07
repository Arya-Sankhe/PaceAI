"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

// One click: the API gathers the shift's figures, has the model write the
// assessment, builds the PDF, and the browser saves it.
export function ReportButton({ machineKey }: { machineKey: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [note, setNote] = useState("");

  const run = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const { blob, filename } = await api.shiftReport(machineKey);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("idle");
    } catch (e) {
      // 409: the machine has not reported anything yet, so there is nothing to write up.
      setNote(e instanceof Error && e.message === "api_409" ? "No machine data yet" : "Failed — try again");
      setState("error");
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={state === "busy"}
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-all disabled:cursor-wait ${
        state === "error"
          ? "border-[#ff5d5d]/40 bg-[#ff5d5d]/10 text-[#ff9a9a]"
          : "border-white/15 bg-white text-black hover:scale-[1.03] active:scale-95 disabled:hover:scale-100"
      }`}
    >
      {state === "busy" ? (
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
      ) : (
        <FileText size={15} aria-hidden="true" />
      )}
      {state === "busy" ? "Building your report…" : state === "error" ? note : "Shift report"}
    </button>
  );
}
