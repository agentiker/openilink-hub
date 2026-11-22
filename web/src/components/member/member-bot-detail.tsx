import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot as BotIcon, Loader2, MessageSquare, UserRound, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, botDisplayName } from "@/lib/api";
import { useBot, useBotWeChatUser } from "@/hooks/use-bots";
import { useBotPush, usePushListener } from "@/lib/ws";
import { MessageItem, type MessageItemData } from "@/pages/console/message-items";

type Message = {
  id: number;
  direction: string;
  item_list: MessageItemData[];
  media_status?: string;
  media_keys?: Record<string, string>;
  created_at: number;
};

const PAGE = 30;

const statusText: Record<string, string> = {
  connected: "运行中",
  session_expired: "授权过期",
  disconnected: "离线",
  error: "异常",
};

function formatTime(ts?: number) {
  return ts ? new Date(ts * 1000).toLocaleString() : "—";
}

/**
 * Simplified user-side bot page: the bot's basic information (including the
 * WeChat user behind it) and its message history, read-only. Console, traces,
 * AI replies and apps are administrator tools.
 */
export function MemberBotDetail({ id }: { id: string }) {
  const { data: bot, isLoading } = useBot(id);
  const { data: owner } = useBotWeChatUser(id);

  if (isLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  if (!bot)
    return (
      <div className="py-20 text-center space-y-4">
        <Unplug className="h-12 w-12 mx-auto opacity-20" />
        <p className="font-bold">未找到账号</p>
        <Button variant="link" asChild>
          <Link to="/dashboard/accounts">返回列表</Link>
        </Button>
      </div>
    );

  const wx = owner?.wechat;
  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full" data-testid="member-bot-detail">
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
              <BotIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight truncate">{botDisplayName(bot)}</h1>
                <Badge variant={bot.status === "connected" ? "default" : "destructive"}>
                  {statusText[bot.status] ?? bot.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono">{bot.id.slice(0, 12)}…</p>
            </div>
          </div>

          {bot.status === "session_expired" ? (
            <p className="text-xs text-orange-600 bg-orange-500/10 rounded-lg px-3 py-2">
              授权已过期，请回到「全部账号」重新扫码绑定。
            </p>
          ) : null}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground mb-1">微信用户</dt>
              <dd className="flex items-center gap-2.5" data-testid="bot-wechat-user">
                {wx?.avatar_url ? (
                  <img
                    src={wx.avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{wx?.nickname || "未完成身份绑定"}</p>
                  {owner?.ilink_user_id ? (
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {owner.ilink_user_id}
                    </p>
                  ) : null}
                </div>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">消息数</dt>
              <dd className="tabular-nums">{bot.msg_count}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">最后消息</dt>
              <dd>{formatTime(bot.last_msg_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">创建时间</dt>
              <dd>{formatTime(bot.created_at)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <MessageHistory botId={bot.id} />
    </div>
  );
}

/** Read-only, newest-first message history with "load more". */
function MessageHistory({ botId }: { botId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFirst = useCallback(async () => {
    try {
      const res = await api.messages(botId, PAGE);
      setMessages(res.messages || []);
      setCursor(res.next_cursor || "");
      setHasMore(!!res.has_more);
      setError("");
    } catch (e: any) {
      setError(e?.message || "消息加载失败");
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    setLoading(true);
    loadFirst();
  }, [loadFirst]);

  // New messages arrive in real time.
  useBotPush(botId);
  usePushListener(
    useCallback(
      (env: any) => {
        if (env.type === "message_new" && env.data?.bot_id === botId) loadFirst();
      },
      [botId, loadFirst],
    ),
  );

  async function loadMore() {
    setLoading(true);
    try {
      const res = await api.messages(botId, PAGE, cursor);
      setMessages((prev) => [...prev, ...(res.messages || [])]);
      setCursor(res.next_cursor || "");
      setHasMore(!!res.has_more);
    } catch (e: any) {
      setError(e?.message || "消息加载失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          历史消息
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" data-testid="message-history">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!loading && messages.length === 0 && !error ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            暂无消息。在微信里给 Bot 发一句话试试。
          </p>
        ) : null}
        {messages.map((m) => {
          const inbound = m.direction === "inbound";
          return (
            <div
              key={m.id}
              className={`flex ${inbound ? "justify-start" : "justify-end"}`}
              data-testid="history-message"
            >
              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm ${
                  inbound
                    ? "bg-muted/60 text-foreground rounded-bl-none"
                    : "bg-primary/10 text-foreground rounded-br-none"
                }`}
              >
                <div className="space-y-2">
                  {(m.item_list || []).length === 0 ? (
                    <span className="text-muted-foreground italic">[空消息]</span>
                  ) : (
                    m.item_list.map((item, i) => (
                      <MessageItem
                        key={`${item.type}-${i}`}
                        item={item}
                        index={i}
                        mediaKeys={m.media_keys}
                        mediaStatus={m.media_status}
                        direction={m.direction}
                      />
                    ))
                  )}
                </div>
                <p
                  className={`text-[10px] mt-1 text-muted-foreground ${inbound ? "text-left" : "text-right"}`}
                >
                  {inbound ? "收到" : "发出"} · {new Date(m.created_at * 1000).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : hasMore ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={loadMore}>
              加载更早的消息
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
