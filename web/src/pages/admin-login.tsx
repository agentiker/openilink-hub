import { useEffect, useState } from "react";
import { KeyRound, ArrowRight, Loader2, X, Shield, Github } from "lucide-react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AuthShell } from "@/components/auth/auth-shell";
import { api } from "@/lib/api";
import { passkeyLogin, supportsPasskey } from "@/lib/passkey";
import { useOAuthProviders } from "@/hooks/use-settings";

const providerLabels: Record<string, { label: string; icon: any }> = {
  github: { label: "GitHub", icon: Github },
  linuxdo: { label: "LinuxDo", icon: Shield },
};

const errorMessages: Record<string, string> = {
  admin_only: "该账号不是管理员。普通用户请使用微信扫码登录。",
  login_failed: "登录失败，请重试。",
};

/**
 * Administrator login: username/password and passkey (and any OAuth/OIDC
 * provider the admin configured — the backend only lets admin accounts in).
 * Regular users sign in by WeChat scan at /login.
 */
export function AdminLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: oauthProviders = [] } = useOAuthProviders();

  useEffect(() => {
    const code = params.get("error");
    if (code) setError(errorMessages[code] || code);
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(username, password);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message === "invalid credentials" ? "用户名或密码错误" : err.message);
    }
    setLoading(false);
  }

  async function handlePasskey() {
    setError("");
    setLoading(true);
    try {
      await passkeyLogin();
      navigate("/dashboard");
    } catch (err: any) {
      if (err.name !== "NotAllowedError") setError(err.message || "通行密钥登录失败");
    }
    setLoading(false);
  }

  return (
    <AuthShell
      subtitle="管理员登录"
      below={
        <p className="mt-6 text-center text-xs text-muted-foreground">
          普通用户请{" "}
          <Link
            to="/login"
            className="text-foreground underline underline-offset-4 hover:no-underline"
          >
            微信扫码登录
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" data-testid="admin-login-form">
        <div className="space-y-1.5">
          <label htmlFor="admin-username" className="text-[13px] font-medium">
            用户名
          </label>
          <Input
            id="admin-username"
            placeholder="管理员用户名"
            autoComplete="username"
            className="h-10"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="admin-password" className="text-[13px] font-medium">
            密码
          </label>
          <Input
            id="admin-password"
            type="password"
            placeholder="登录密码"
            autoComplete="current-password"
            className="h-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        {error ? (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-2.5 text-[13px] text-destructive"
            role="alert"
          >
            <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </div>
        ) : null}

        <Button type="submit" className="h-10 w-full text-sm font-medium" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          登录
          {!loading && <ArrowRight className="ml-2 h-3.5 w-3.5" />}
        </Button>
      </form>

      {supportsPasskey() || oauthProviders.length > 0 ? (
        <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs text-muted-foreground">
              <span className="bg-card px-3">或</span>
            </div>
          </div>
          <div className="space-y-2">
            {supportsPasskey() ? (
              <Button
                type="button"
                variant="outline"
                className="w-full h-9 gap-2 font-medium text-sm"
                onClick={handlePasskey}
                disabled={loading}
              >
                <KeyRound className="h-4 w-4" aria-hidden />
                使用通行密钥登录
              </Button>
            ) : null}
            {oauthProviders.map((provider) => {
              const config = providerLabels[provider.name] || {
                label: provider.display_name || provider.name,
                icon: Shield,
              };
              return (
                <Button
                  key={provider.name}
                  variant="outline"
                  className="w-full h-9 gap-2 font-medium text-sm"
                  onClick={() =>
                    (window.location.href =
                      provider.type === "oidc"
                        ? `/api/auth/oidc/${provider.name}`
                        : `/api/auth/oauth/${provider.name}`)
                  }
                >
                  <config.icon className="h-4 w-4" />
                  使用 {config.label} 登录
                </Button>
              );
            })}
          </div>
        </>
      ) : null}
    </AuthShell>
  );
}
