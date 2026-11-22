import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link2, Unlink, UserRound } from "lucide-react";
import { api, type BotContact } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useToast } from "@/hooks/use-toast";
import { useBotContacts } from "@/hooks/use-bots";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Display name for a contact: bound WeChat nickname, else the raw iLink id. */
export function contactName(c: Pick<BotContact, "user_id" | "wechat">): string {
  return c.wechat?.nickname || c.user_id;
}

/**
 * Contacts of a bot with their real WeChat identity (服务号网页授权).
 * "发送绑定链接" sends the contact a link; opening it in WeChat binds
 * openid/unionid/nickname/avatar to their iLink id.
 */
export function WeChatContactsCard({ botId }: { botId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string>();
  const { data: contacts = [], isLoading } = useBotContacts(botId);
  // Only platform administrators may send bind links or unbind identities.
  const isAdmin = useAuthStore((s) => isAdminRole(s.user?.role));

  async function sendLink(c: BotContact) {
    setBusy(c.user_id);
    try {
      const r = await api.wechatBindLink(botId, { recipient: c.user_id, send: true });
      toast({
        title: r.queued ? "绑定链接已排队" : "绑定链接已发送",
        description: r.queued
          ? "对方的接收额度已用完，回复 Bot 后会收到链接"
          : "对方在微信中点击链接并同意授权后即完成绑定",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "发送失败", description: e.message });
    } finally {
      setBusy(undefined);
    }
  }

  async function unbind(c: BotContact) {
    setBusy(c.user_id);
    try {
      await api.wechatUnbind(botId, c.user_id);
      await qc.invalidateQueries({ queryKey: queryKeys.bots.contacts(botId) });
      toast({ title: "已解除绑定" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "解除失败", description: e.message });
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle className="text-sm">联系人</CardTitle>
        <CardDescription>
          {isAdmin
            ? "iLink 只提供匿名 ID。发送绑定链接，对方在微信中授权后可显示真实昵称和头像。"
            : "已完成微信身份绑定的联系人会显示真实昵称和头像（绑定由平台管理员发起）。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无联系人（用户给 Bot 发消息后出现）</p>
        ) : (
          contacts.map((c) => (
            <div
              key={c.user_id}
              className="flex items-center justify-between gap-3 p-2.5 rounded-lg border bg-background"
              data-testid="wechat-contact"
            >
              <div className="flex items-center gap-3 min-w-0">
                {c.wechat?.avatar_url ? (
                  <img
                    src={c.wechat.avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{contactName(c)}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {c.wechat
                      ? c.wechat.unionid
                        ? `unionid ${c.wechat.unionid}`
                        : `openid ${c.wechat.openid}`
                      : c.user_id}
                  </p>
                </div>
              </div>
              {!isAdmin ? null : c.wechat ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === c.user_id}
                  onClick={() => unbind(c)}
                >
                  <Unlink className="h-3.5 w-3.5 mr-1" /> 解绑
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === c.user_id}
                  onClick={() => sendLink(c)}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" /> 发送绑定链接
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
