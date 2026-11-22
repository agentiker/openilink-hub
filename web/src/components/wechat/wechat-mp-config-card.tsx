import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type WeChatMPConfig } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const KEY = ["admin", "wechat-mp-config"] as const;

/** Admin: 微信服务号 used for 网页授权 identity binding. */
export function WeChatMPConfigCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: api.getWeChatMPConfig });
  const [form, setForm] = useState({ app_id: "", app_secret: "", verify_file: "", userinfo: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        app_id: data.app_id,
        app_secret: data.app_secret,
        verify_file: data.verify_file,
        userinfo: data.scope !== "snsapi_base",
      });
    }
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      const r: WeChatMPConfig = await api.setWeChatMPConfig({
        app_id: form.app_id,
        app_secret: form.app_secret,
        verify_file: form.verify_file,
        scope: form.userinfo ? "snsapi_userinfo" : "snsapi_base",
      });
      qc.setQueryData(KEY, r);
      toast({ title: "已保存" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "保存失败", description: e.message });
    } finally {
      setSaving(false);
    }
  }

  const domain = data?.callback_url ? new URL(data.callback_url).host : "";

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle>微信服务号（身份绑定）</CardTitle>
        <CardDescription>
          用于获取联系人的真实微信身份（openid / unionid / 昵称 /
          头像）。需要已认证服务号，并在公众平台 「设置与开发 → 公众号设置 → 功能设置 →
          网页授权域名」中填写 <code className="font-mono">{domain || "Hub 域名"}</code>。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="wxmp-appid">AppID</Label>
            <Input
              id="wxmp-appid"
              value={form.app_id}
              onChange={(e) => setForm({ ...form, app_id: e.target.value })}
              placeholder="wx…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wxmp-secret">AppSecret</Label>
            <Input
              id="wxmp-secret"
              type="password"
              value={form.app_secret}
              onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
              placeholder={data?.enabled ? "留空则不修改" : ""}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="wxmp-verify">域名校验文件名（可选）</Label>
          <Input
            id="wxmp-verify"
            value={form.verify_file}
            onChange={(e) => setForm({ ...form, verify_file: e.target.value })}
            placeholder="MP_verify_xxxxxxxx.txt"
          />
          <p className="text-xs text-muted-foreground">
            填写后 Hub 会在根路径提供该文件，用于通过网页授权域名校验。
          </p>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50">
          <div>
            <p className="text-sm font-medium">获取昵称和头像</p>
            <p className="text-xs text-muted-foreground">
              开启为 snsapi_userinfo（用户需点击同意）；关闭为 snsapi_base（静默，只有
              openid/unionid）
            </p>
          </div>
          <Switch
            aria-label="获取昵称和头像"
            checked={form.userinfo}
            onCheckedChange={(v) => setForm({ ...form, userinfo: v })}
          />
        </div>
        {data?.callback_url ? (
          <p className="text-xs text-muted-foreground">
            授权回调地址：<code className="font-mono">{data.callback_url}</code>
            {data.callback_url.startsWith("http://")
              ? "（需 HTTPS 公网域名，请用 -origin / RP_ORIGIN 配置）"
              : ""}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || (!form.app_id && !form.verify_file)}>
            保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
