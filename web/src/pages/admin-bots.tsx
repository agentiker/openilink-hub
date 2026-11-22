import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminBots } from "@/hooks/use-admin";
import { botDisplayName, type AdminBot } from "@/lib/api";

const statusLabel: Record<
  string,
  { text: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  connected: { text: "在线", variant: "default" },
  session_expired: { text: "已过期", variant: "destructive" },
  disconnected: { text: "离线", variant: "secondary" },
  error: { text: "异常", variant: "destructive" },
};

function formatTime(ts?: number) {
  return ts ? new Date(ts * 1000).toLocaleString() : "—";
}

/** Who the WeChat user behind a bot is: bound nickname, else the iLink id. */
export function WeChatUserCell({ bot }: { bot: Pick<AdminBot, "ilink_user_id" | "wechat"> }) {
  if (!bot.ilink_user_id) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2 min-w-0">
      {bot.wechat?.avatar_url ? (
        <img
          src={bot.wechat.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          className="h-7 w-7 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm truncate">{bot.wechat?.nickname || "未绑定身份"}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[220px]">
          {bot.ilink_user_id}
        </p>
      </div>
    </div>
  );
}

export function AdminBotsPage() {
  const { data: bots = [], isLoading } = useAdminBots();
  const online = bots.filter((b) => b.status === "connected").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bot 管理</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          平台全部 Bot（{bots.length} 个，在线 {online}{" "}
          个）及其所属用户和绑定的微信用户。只读，凭证不会在此展示。
        </p>
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Bot</TableHead>
              <TableHead>微信用户</TableHead>
              <TableHead>所属账号</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">联系人 / 消息</TableHead>
              <TableHead>最后消息</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : bots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  平台上还没有 Bot
                </TableCell>
              </TableRow>
            ) : (
              bots.map((b) => {
                const st = statusLabel[b.status] ?? { text: b.status, variant: "outline" as const };
                return (
                  <TableRow key={b.id} data-testid="admin-bot-row">
                    <TableCell>
                      <p className="font-medium">{botDisplayName(b)}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {b.id.slice(0, 8)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <WeChatUserCell bot={b} />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{b.owner.username || b.owner.id.slice(0, 8)}</p>
                      {b.owner.role && b.owner.role !== "member" ? (
                        <p className="text-[11px] text-muted-foreground">{b.owner.role}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.text}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {b.contact_count} / {b.msg_count}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTime(b.last_msg_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTime(b.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
