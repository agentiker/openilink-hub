import { useEffect, useRef, useState } from "react";
import { Loader2, X, QrCode } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import QRCode from "qrcode";

import { Button } from "../components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { useInfo } from "@/hooks/use-auth";

function QrCanvas({ url, size = 224 }: { url: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (url && ref.current) QRCode.toCanvas(ref.current, url, { width: size, margin: 0 });
  }, [url, size]);
  return <canvas ref={ref} className="block rounded-lg" />;
}

/** Opened inside WeChat on the phone: the ClawBot QR cannot be scanned from here. */
const inWeChat = typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);

/**
 * Two-stage onboarding guidance.
 *
 * iLink only accepts a camera scan of the ClawBot QR shown on another screen
 * (tapping the link or long-pressing the QR inside WeChat does nothing), so
 * registration happens here; later logins are one tap inside WeChat via /m
 * (服务号网页授权), once the identity-binding link from the bot was opened.
 */
function OnboardingSteps() {
  return (
    <ol className="w-full space-y-2 text-xs text-muted-foreground" data-testid="onboarding-steps">
      {[
        [
          "扫码注册",
          "用手机微信的「扫一扫」扫描上方二维码，在 ClawBot 中确认，自动创建账号并绑定 Bot。",
        ],
        ["身份绑定", "在微信里给 Bot 发一句话，点开 Bot 发来的「身份绑定」链接并授权。"],
        ["一键登录", "以后在手机微信中打开下方入口，无需再扫码。"],
      ].map(([t, d], i) => (
        <li key={t} className="flex gap-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {i + 1}
          </span>
          <span>
            <b className="text-foreground">{t}</b>：{d}
          </span>
        </li>
      ))}
    </ol>
  );
}

function MobileEntry() {
  const url = `${window.location.origin}/m`;
  return (
    <div
      className="w-full rounded-xl border border-border/60 bg-muted/20 p-3 flex items-center gap-3"
      data-testid="mobile-entry"
    >
      <div className="rounded-lg bg-white p-1.5 shrink-0">
        <QrCanvas url={url} size={72} />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold">已注册？手机微信一键登录</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          用微信扫这个码，在手机上直接登录；也可以在微信里收藏{" "}
          <span className="font-mono">{window.location.host}/m</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Regular users sign in by WeChat scan only (no password, passkey or OAuth).
 * Administrators use /admin/login.
 */
export function LoginPage() {
  const navigate = useNavigate();

  const [qrUrl, setQrUrl] = useState("");
  const [scanStatus, setScanStatus] = useState<"idle" | "loading" | "wait" | "scanned" | "error">(
    "idle",
  );
  const [scanMessage, setScanMessage] = useState("");
  const scanWsRef = useRef<WebSocket | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: infoData } = useInfo();
  const registrationEnabled = infoData?.registration_enabled !== false;

  // Auto-start scan login on mount; cleanup WS/timer on unmount
  useEffect(() => {
    startScanLogin();
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      if (scanWsRef.current) scanWsRef.current.close();
    };
  }, []);

  async function startScanLogin() {
    setScanStatus("loading");
    setScanMessage("正在初始化...");
    setQrUrl("");
    try {
      const res = await fetch("/api/auth/scan/start", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "初始化失败");

      setQrUrl(data.qr_url);
      setScanStatus("wait");
      setScanMessage("请使用微信扫描二维码");

      connectScanWS(data.session_id);
    } catch (err: any) {
      setScanStatus("error");
      setScanMessage(err.message || "初始化失败");
    }
  }

  function connectScanWS(sessionID: string, retries = 0) {
    const MAX_RETRIES = 5;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/auth/scan/status/${sessionID}`,
    );
    scanWsRef.current = ws;
    let settled = false;

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.event === "status") {
        if (d.status === "wait") {
          // keep waiting
        } else if (d.status === "scanned") {
          setScanStatus("scanned");
          setScanMessage("已扫码，请在手机上确认...");
        } else if (d.status === "refreshed") {
          setQrUrl(d.qr_url);
          setScanStatus("wait");
          setScanMessage("二维码已刷新，请重新扫描");
        } else if (d.status === "connected") {
          settled = true;
          if (d.session_token) {
            document.cookie = `session=${d.session_token}; path=/; max-age=${7 * 24 * 3600}; samesite=lax`;
          }
          ws.close();
          navigate(
            d.is_new && d.bot_id ? `/dashboard/onboarding?bot_id=${d.bot_id}` : "/dashboard",
          );
        }
      } else if (d.event === "error") {
        settled = true;
        setScanMessage(d.message || "扫码登录失败");
        setScanStatus("error");
        ws.close();
      }
    };
    ws.onerror = () => {
      ws.close();
    };
    ws.onclose = () => {
      if (settled) return;
      if (retries < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** retries, 8000);
        setScanMessage("连接中断，正在重连...");
        scanTimerRef.current = setTimeout(() => connectScanWS(sessionID, retries + 1), delay);
      } else {
        setScanStatus("error");
        setScanMessage("连接中断，请刷新重试");
      }
    };
  }

  // Inside WeChat: the user already has an account (or needs another screen).
  if (inWeChat) {
    return (
      <AuthShell subtitle="手机微信一键登录">
        <div className="flex flex-col items-center gap-5 text-center" data-testid="wechat-entry">
          <Button asChild className="w-full h-11 font-bold">
            <a href="/m">微信一键登录</a>
          </Button>
          <p className="text-xs text-muted-foreground leading-relaxed">
            适用于已完成注册和身份绑定的用户。
            <br />
            首次使用需要注册：请在电脑上打开{" "}
            <span className="font-mono">{window.location.host}/login</span>
            ，再用手机微信「扫一扫」扫描页面上的二维码（在微信里长按识别或点击链接无法完成注册）。
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      subtitle="首次使用请扫码注册，已注册可在手机微信一键登录"
      below={
        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          管理员请从{" "}
          <Link to="/admin/login" className="underline hover:text-foreground">
            管理员入口
          </Link>{" "}
          登录
        </p>
      }
    >
      <div className="flex flex-col items-center gap-6" data-testid="scan-login">
        <div className="relative group">
          <div className="absolute -inset-4 bg-primary/5 rounded-[2rem] blur-xl group-hover:bg-primary/10 transition-all" />
          {qrUrl ? (
            <div className="relative rounded-2xl border-4 border-background bg-white p-4 shadow-2xl">
              <QrCanvas url={qrUrl} />
            </div>
          ) : (
            <div className="relative flex h-[224px] w-[224px] items-center justify-center rounded-2xl border-2 border-dashed bg-muted/30">
              {scanStatus === "error" ? (
                <div className="text-center space-y-3 px-4">
                  <X className="h-8 w-8 text-destructive mx-auto" />
                  <p className="text-xs text-muted-foreground">{scanMessage}</p>
                  <Button size="sm" variant="outline" onClick={startScanLogin}>
                    重新获取
                  </Button>
                </div>
              ) : (
                <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
              )}
            </div>
          )}
        </div>

        <div className="text-center space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            <p className="font-bold text-sm">{scanMessage || "正在加载..."}</p>
          </div>
          <p className="text-xs text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
            {scanStatus === "scanned"
              ? "请在手机微信的 ClawBot 中点击确认"
              : !infoData || registrationEnabled
                ? "请用手机微信「扫一扫」扫描（长按识别无效）。首次使用会自动创建账号并绑定 Bot。"
                : "请用手机微信「扫一扫」扫描。当前仅限已注册的微信账号，新用户暂不开放。"}
          </p>
        </div>

        <OnboardingSteps />
        <MobileEntry />
      </div>
    </AuthShell>
  );
}
