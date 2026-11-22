import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCw, ScanLine, Smartphone } from "lucide-react";
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
    <ol
      className="w-full space-y-3 text-[13px] leading-relaxed text-muted-foreground"
      data-testid="onboarding-steps"
    >
      {[
        [
          "扫码注册",
          "用手机微信的「扫一扫」扫描上方二维码，在 ClawBot 中确认，自动创建账号并绑定 Bot。",
        ],
        ["身份绑定", "在微信里给 Bot 发一句话，点开 Bot 发来的「身份绑定」链接并授权。"],
        ["一键登录", "以后在手机微信中打开下方入口，无需再扫码。"],
      ].map(([t, d], i) => (
        <li key={t} className="flex gap-2.5">
          <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-medium text-foreground tabular-nums">
            {i + 1}
          </span>
          <span>
            <span className="font-medium text-foreground">{t}</span>　{d}
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
      className="flex w-full items-center gap-4 rounded-lg border border-border bg-muted p-3.5"
      data-testid="mobile-entry"
    >
      <div className="shrink-0 rounded-md bg-white p-1.5 ring-1 ring-border">
        <QrCanvas url={url} size={68} />
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Smartphone className="size-3.5 text-muted-foreground" aria-hidden />
          已注册？手机微信一键登录
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          用微信扫这个码，在手机上直接登录；也可以收藏 {window.location.host}/m
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
          <Button asChild className="h-11 w-full text-[15px] font-medium">
            <a href="/m">微信一键登录</a>
          </Button>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            适用于已完成注册和身份绑定的用户。
            <br />
            首次使用需要注册：请在电脑上打开{" "}
            <span className="font-medium text-foreground">{window.location.host}/login</span>
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
        <p className="mt-6 text-center text-xs text-muted-foreground">
          管理员请从{" "}
          <Link
            to="/admin/login"
            className="text-foreground underline underline-offset-4 hover:no-underline"
          >
            管理员入口
          </Link>{" "}
          登录
        </p>
      }
    >
      <div className="flex flex-col items-center gap-6" data-testid="scan-login">
        <div className="flex size-[232px] items-center justify-center rounded-lg border border-border bg-white p-3">
          {qrUrl ? (
            <div
              className={
                scanStatus === "scanned" ? "opacity-25 transition-opacity" : "transition-opacity"
              }
            >
              <QrCanvas url={qrUrl} size={204} />
            </div>
          ) : scanStatus === "error" ? (
            <div className="space-y-3 px-4 text-center">
              <p className="text-[13px] text-muted-foreground">{scanMessage}</p>
              <Button size="sm" variant="outline" onClick={startScanLogin} className="gap-1.5">
                <RotateCw className="size-3.5" aria-hidden />
                重新获取
              </Button>
            </div>
          ) : (
            <Loader2
              className="size-6 animate-spin text-muted-foreground"
              aria-label="正在加载二维码"
            />
          )}
        </div>

        <div className="space-y-1.5 text-center" aria-live="polite">
          <p className="flex items-center justify-center gap-2 text-sm font-medium">
            {scanStatus === "scanned" ? (
              <span className="size-2 rounded-full bg-success" aria-hidden />
            ) : (
              <ScanLine className="size-4 text-muted-foreground" aria-hidden />
            )}
            {scanMessage || "正在加载..."}
          </p>
          <p className="mx-auto max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
            {scanStatus === "scanned"
              ? "请在手机微信的 ClawBot 中点击确认"
              : !infoData || registrationEnabled
                ? "请用手机微信「扫一扫」扫描（长按识别无效）。首次使用会自动创建账号并绑定 Bot。"
                : "请用手机微信「扫一扫」扫描。当前仅限已注册的微信账号，新用户暂不开放。"}
          </p>
        </div>

        <div className="h-px w-full bg-border" />

        <OnboardingSteps />
        <MobileEntry />
      </div>
    </AuthShell>
  );
}
