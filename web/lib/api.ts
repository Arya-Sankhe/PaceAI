import { supabase } from "./supabase";

async function headers(init?: RequestInit): Promise<HeadersInit> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { ...init, headers: await headers(init) });
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      await supabase().auth.signOut();
      window.location.href = "/login";
    }
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `api_${res.status}`);
  return res.json();
}

export const api = {
  machines: () => req<{ id: string; machine_key: string; name: string }[]>("/machines"),
  latest: (key: string) => req<MachineState>(`/machines/${key}/latest`),
  history: (key: string, since: string, until: string) =>
    req<History>(`/machines/${key}/history?since=${since}&until=${until}`),
  events: (key: string) => req<ApiEvent[]>(`/machines/${key}/events`),
  manuals: () => req<Manual[]>("/documents"),
  upload: async (f: FormData) => {
    const { data } = await supabase().auth.getSession();
    const res = await fetch("/api/v1/documents/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token}` },
      body: f,
    });
    if (!res.ok) throw new Error("upload_failed");
    return res.json();
  },
  job: (id: string) => req<{ status: string; last_error: string | null }>(`/documents/${id}/job`),
  activate: (id: string) => req<{ ok: boolean }>(`/documents/${id}/activate`, { method: "POST" }),
  pageUrl: (id: string, num: number) =>
    req<{ url: string; expires_in: number }>(`/documents/${id}/pages/${num}/signed-url`),
  conversations: () => req<Conversation[]>("/conversations"),
  conversation: (id: string) => req<ConversationDetail>(`/conversations/${id}`),
};

export type Freshness = "live" | "stale" | "disconnected" | "bad_quality" | "unknown";
export interface MachineState {
  machine_key: string; freshness: Freshness; source_ts: string | null;
  age_seconds: number | null; values: Record<string, number>;
  quality: Record<string, string>; collector_connected: boolean;
}
export interface History { machine_key: string; resolution: string; points: { t: string; values: Record<string, number | null> }[]; }
export interface ApiEvent { id: number; ts: string; event_type: string; severity: string; data: Record<string, unknown>; }
export interface Manual { id: string; family_key: string; revision: string; title: string; total_pages: number; status: string; is_active: boolean; }
export interface Conversation { id: string; machine_id: string; title: string; created_at: string; }
export interface ChatMsg { role: string; content: string; evidence: Record<string, unknown>; created_at: string; }
export interface ConversationDetail { id: string; title: string; messages: ChatMsg[]; }
