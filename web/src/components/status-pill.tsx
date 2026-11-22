/** Bot connection status as a quiet pill with a coloured dot (green only when live). */
const STATUS: Record<string, { label: string; tone: string; dot: string }> = {
  connected: { label: "运行中", tone: "bg-success-soft text-success", dot: "bg-success" },
  disconnected: {
    label: "离线",
    tone: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  error: { label: "故障", tone: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  session_expired: {
    label: "授权过期",
    tone: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const s = STATUS[status] ?? {
    label: status,
    tone: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.tone} ${className}`}
      data-testid="status-pill"
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}
