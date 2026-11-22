import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Cable,
  Check,
  Clock,
  MessagesSquare,
  Send,
  ScanLine,
  Smartphone,
  UserRound,
  Webhook,
} from "lucide-react";
import { HiLogo } from "@/components/brand/hi-logo";
import { useUser } from "@/hooks/use-auth";

/**
 * Public home page. The overseas-AI-product canon, played straight:
 * centred statement, the two real actions, and the real member console
 * in a browser frame, then how it works, what it does, and the quota.
 */
export function HomePage() {
  const { data: user, isLoading } = useUser();
  const loggedIn = !isLoading && !!user;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav loggedIn={loggedIn} />

      <main>
        <section className="px-6 pt-20 pb-10 text-center sm:pt-28">
          <h1 className="mx-auto max-w-4xl text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
            让微信替你收发消息
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            把个人微信连成 Bot，消息实时转给
            AI、飞书或你的服务器。额度用完先排队，对方回话后自动送达，不会悄悄丢失。
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {loggedIn ? (
              <PrimaryLink to="/dashboard">进入控制台</PrimaryLink>
            ) : (
              <>
                <PrimaryLink to="/login">扫码开通</PrimaryLink>
                <SecondaryLink href="/m">已开通？手机一键登录</SecondaryLink>
              </>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">用手机微信「扫一扫」，约 1 分钟</p>
        </section>

        <section className="px-4 sm:px-6" aria-label="控制台预览">
          <ConsolePreview />
        </section>

        <HowItWorks />
        <Capabilities />
        <QuotaNote />

        <section className="border-t border-border px-6 py-24 text-center">
          <h2 className="text-[1.75rem] font-semibold tracking-[-0.03em] sm:text-4xl">
            现在就把微信连上
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            扫一次码即可开通，之后在手机微信里点一下就能登录。
          </p>
          <div className="mt-8 flex justify-center">
            <PrimaryLink to={loggedIn ? "/dashboard" : "/login"}>
              {loggedIn ? "进入控制台" : "扫码开通"}
            </PrimaryLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <HiLogo className="text-sm text-foreground" markClassName="size-5" />
          <div className="flex items-center gap-6">
            <Link to="/m" className="hover:text-foreground">
              手机一键登录
            </Link>
            <Link to="/admin/login" className="hover:text-foreground">
              管理员入口
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SiteNav({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6" aria-label="主导航">
        <Link to="/" aria-label="Hi微连 首页">
          <HiLogo className="text-[15px]" markClassName="size-7" />
        </Link>
        <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#how" className="transition-colors hover:text-foreground">
            如何开通
          </a>
          <a href="#features" className="transition-colors hover:text-foreground">
            能做什么
          </a>
          <a href="#quota" className="transition-colors hover:text-foreground">
            额度说明
          </a>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/admin/login"
            className="hidden px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            管理员入口
          </Link>
          {loggedIn ? (
            <PrimaryLink to="/dashboard" small>
              控制台
            </PrimaryLink>
          ) : (
            <>
              <SecondaryLink href="/m" small className="hidden sm:inline-flex">
                手机登录
              </SecondaryLink>
              <PrimaryLink to="/login" small>
                开始使用
              </PrimaryLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,box-shadow,transform] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2";

function PrimaryLink({
  to,
  children,
  small,
}: {
  to: string;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`${btnBase} bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,.12)] hover:bg-primary/88 ${
        small ? "h-9 px-4 text-sm" : "h-12 px-7 text-[15px]"
      }`}
    >
      {children}
      {!small ? <ArrowRight className="size-4" aria-hidden /> : null}
    </Link>
  );
}

function SecondaryLink({
  href,
  children,
  small,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  small?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`${btnBase} border border-border bg-background text-foreground hover:bg-accent ${
        small ? "h-9 px-4 text-sm" : "h-12 px-7 text-[15px]"
      } ${className}`}
    >
      {children}
    </a>
  );
}

/** The member console, drawn as it really is (labelled sample data). */
function ConsolePreview() {
  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-xl border border-border bg-muted shadow-[0_32px_64px_-28px_rgba(16,24,20,.28),0_2px_6px_rgba(16,24,20,.05)]">
        <div className="flex h-10 items-center gap-2 border-b border-border bg-background px-4">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="ml-3 truncate text-xs text-muted-foreground">
            hub.xdimspace.cn/dashboard/accounts
          </span>
        </div>
        <div className="grid min-h-[360px] grid-cols-1 md:grid-cols-[200px_1fr]">
          <aside className="hidden border-r border-border bg-background p-3 text-sm md:block">
            <p className="rounded-md px-2.5 py-1.5 text-muted-foreground">概览</p>
            <p className="rounded-md bg-accent px-2.5 py-1.5 font-medium">我的 Bot</p>
            <p className="rounded-md px-2.5 py-1.5 text-muted-foreground">设置</p>
          </aside>
          <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[300px_1fr]">
            <div className="rounded-lg border border-border bg-background p-5 text-left">
              <div className="flex items-center gap-2">
                <p className="font-semibold">我的 Bot</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                  <span className="size-1.5 rounded-full bg-success" />
                  运行中
                </span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                  <UserRound className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">方瑾曜</p>
                  <p className="truncate text-[11px] text-muted-foreground">o9cq807yn@im.wechat</p>
                </div>
              </div>
              <dl className="mt-4 divide-y divide-border border-t border-border text-sm">
                <Row k="本轮额度" v="7 / 10" />
                <Row k="今日消息" v="128" />
                <Row k="最后消息" v="09:12" />
              </dl>
            </div>
            <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-background p-5 text-left text-sm">
              <Bubble side="in" text="明早九点的会改到十点" meta="收到 · 09:12" />
              <Bubble side="out" text="收到，已同步到你的飞书日程" meta="AI 回复 · 09:12" />
              <Bubble side="in" text="订单 2047 发货了吗？" meta="收到 · 09:40" />
              <Bubble
                side="out"
                text="已发货，快递单号稍后发你"
                meta="排队中 · 等对方回话后送达"
                queued
              />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">示例界面，数据为演示。</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}

function Bubble({
  side,
  text,
  meta,
  queued,
}: {
  side: "in" | "out";
  text: string;
  meta: string;
  queued?: boolean;
}) {
  const out = side === "out";
  return (
    <div className={`flex flex-col ${out ? "items-end" : "items-start"}`}>
      <p
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 leading-relaxed ${
          out
            ? `rounded-br-md bg-primary text-primary-foreground ${queued ? "opacity-55" : ""}`
            : "rounded-bl-md border border-border bg-background"
        }`}
      >
        {text}
      </p>
      <span className="mt-1 text-[11px] text-muted-foreground">{meta}</span>
    </div>
  );
}

function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] [word-break:keep-all] sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

/** Two-stage onboarding: register once by camera scan, then one tap in WeChat. */
function HowItWorks() {
  const steps = [
    {
      icon: ScanLine,
      title: "扫码注册",
      desc: "在电脑上打开登录页，用手机微信的「扫一扫」扫描二维码，在 ClawBot 中确认。账号和 Bot 会自动创建。",
      note: "需要用另一块屏幕展示二维码，长按识别无效。",
    },
    {
      icon: Send,
      title: "身份绑定",
      desc: "在微信里给 Bot 发一句话，它会回你一条「身份绑定」链接。点开并授权，Hi微连 就认得你了。",
      note: "只需一次。",
    },
    {
      icon: Smartphone,
      title: "一键登录",
      desc: "以后在手机微信里打开登录入口，无需再扫码，直接进入你的控制台。",
      note: "电脑上也可以随时扫码登录。",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 pt-28 pb-8">
      <SectionHead
        title="三步开通，之后只需点一下"
        desc="扫一次码完成注册，之后在手机微信里一键登录。"
      />
      <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col bg-background p-7">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-md border border-border text-sm font-medium tabular-nums">
                {i + 1}
              </span>
              <s.icon className="size-4 text-muted-foreground" aria-hidden />
            </div>
            <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            <p className="mt-auto pt-6 text-xs text-muted-foreground/80">{s.note}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Capabilities() {
  const routes = [
    { icon: Bot, name: "AI 回复", desc: "接入 OpenAI 兼容模型，按你的规则自动回复。" },
    {
      icon: MessagesSquare,
      name: "飞书 / 钉钉 / 企业微信",
      desc: "消息与工作群互通，在哪边回复都行。",
    },
    {
      icon: Webhook,
      name: "Webhook / HTTP API",
      desc: "推到你自己的服务，或通过 API 让 Bot 发消息。",
    },
    { icon: Cable, name: "WebSocket", desc: "实时双向收发，适合长连接的客户端。" },
  ];
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 pt-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <SectionHead
          title="一条消息，转到你需要的地方"
          desc="Bot 收到的每条消息都会被记录，并按你的配置转发。每条消息从收到到送达的过程都可以追溯。"
        />
        <ul className="divide-y divide-border rounded-xl border border-border">
          {routes.map((r) => (
            <li key={r.name} className="flex items-start gap-4 p-5">
              <r.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** iLink's per-message allowance, explained honestly. */
function QuotaNote() {
  return (
    <section id="quota" className="mx-auto max-w-6xl scroll-mt-20 px-6 pt-28 pb-28">
      <div className="grid gap-12 rounded-2xl border border-border bg-muted p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] [word-break:keep-all] sm:text-3xl">
            每回一句，Bot 可发 10 条
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            这是微信 ClawBot 的规则：对方每给 Bot 发一句话，Bot 就能回复 10 条。Hi微连 会在第 10
            条提醒对方回复；超出的消息先排队，对方一回话就自动补发，不会悄悄丢失。
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">本轮额度</p>
            <p className="text-sm tabular-nums text-muted-foreground">
              <span className="text-2xl font-semibold text-foreground">7</span> / 10
            </p>
          </div>
          <div className="mt-4 grid grid-cols-10 gap-1.5" aria-hidden>
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full ${i < 3 ? "bg-foreground" : "bg-border"}`}
              />
            ))}
          </div>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />第 10
              条自动附带「回复任意消息，继续接收」的提醒
            </li>
            <li className="flex gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              超出的消息排队，对方回话后自动补发
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
