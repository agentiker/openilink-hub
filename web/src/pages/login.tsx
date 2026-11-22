import { useEffect, useRef, useState } from "react";
import { Loader2, X, QrCode } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import QRCode from "qrcode";

import { Button } from "../components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { useInfo } from "@/hooks/use-auth";

function QrCanvas({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (url && ref.current) QRCode.toCanvas(ref.current, url, { width: 224, margin: 0 });
  }, [url]);
  return <canvas ref={ref} className="block rounded-lg" />;
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

  return (
    <AuthShell
      subtitle="微信扫码，一键登录"
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
              ? "请在手机上确认登录"
              : !infoData
                ? "打开微信，扫描二维码即可登录。"
                : registrationEnabled
                  ? "打开微信，扫描二维码即可登录。首次使用会自动创建账号并绑定 Bot。"
                  : "打开微信，扫描二维码即可登录。仅限已绑定的微信账号。"}
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
