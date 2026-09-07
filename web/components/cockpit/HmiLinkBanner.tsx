import { MonitorSmartphone } from "lucide-react";

// Never embedded, never proxied — plant-local link only.
export function HmiLinkBanner({ host }: { host: string }) {
  return (
    <a href={`http://${host}:81`} target="_blank" rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
      <MonitorSmartphone size={16} />
      Plant Network Only ({host}:81) — opens the B&R HMI in a new tab. Unreachable outside the plant/VPN.
    </a>
  );
}
