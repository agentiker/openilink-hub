import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bot,
  MessageSquare,
  Zap,
  Plus,
  ArrowRight,
  Wifi,
  Workflow,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useBotStats } from "@/hooks/use-bots";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";

const STEPS = [
  {
    step: "01",
    title: "添加微信账号",
    desc: "扫码登录你的微信，连接到平台。",
    link: "/dashboard/accounts",
    icon: Cpu,
    color: "text-foreground",
    bg: "bg-muted",
  },
  {
    step: "02",
    title: "创建转发规则",
    desc: "设置消息转发到你的服务器或 AI。",
    link: "/dashboard/accounts",
    icon: Workflow,
    color: "text-foreground",
    bg: "bg-muted",
  },
  {
    step: "03",
    title: "安装应用",
    desc: "从市场安装现成的扩展功能。",
    link: "/dashboard/apps",
    icon: Zap,
    color: "text-foreground",
    bg: "bg-muted",
  },
] as const;

const QUICK_LINKS = [
  { label: "全部账号", icon: Bot, link: "/dashboard/accounts" },
  { label: "应用市场", icon: Workflow, link: "/dashboard/apps" },
  { label: "系统设置", icon: Cpu, link: "/dashboard/settings/profile" },
] as const;

/** Regular users: the two-stage onboarding instead of forwarding rules/apps. */
const MEMBER_STEPS = [
  {
    step: "01",
    title: "扫码注册",
    desc: "在电脑上打开登录页，用手机微信「扫一扫」绑定 Bot。",
    link: "/dashboard/accounts",
    icon: Cpu,
    color: "text-foreground",
    bg: "bg-muted",
  },
  {
    step: "02",
    title: "身份绑定",
    desc: "在微信里给 Bot 发一句话，点开 Bot 发来的身份绑定链接。",
    link: "/dashboard/accounts",
    icon: MessageSquare,
    color: "text-foreground",
    bg: "bg-muted",
  },
  {
    step: "03",
    title: "一键登录",
    desc: "以后在手机微信里打开登录入口即可直接登录。",
    link: "/dashboard/accounts",
    icon: Zap,
    color: "text-foreground",
    bg: "bg-muted",
  },
] as const;

const MEMBER_QUICK_LINKS = [
  { label: "全部账号", icon: Bot, link: "/dashboard/accounts" },
  { label: "个人设置", icon: Cpu, link: "/dashboard/settings/profile" },
] as const;

export function DashboardOverviewPage() {
  const { data: stats, isLoading: loading } = useBotStats();
  const isAdmin = useAuthStore((s) => isAdminRole(s.user?.role));
  const steps = isAdmin ? STEPS : MEMBER_STEPS;
  const quickLinks = isAdmin ? QUICK_LINKS : MEMBER_QUICK_LINKS;

  if (loading)
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-7">
          <Skeleton className="h-64 lg:col-span-4" />
          <Skeleton className="h-64 lg:col-span-3" />
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">概览</h1>
          <p className="text-sm text-muted-foreground mt-0.5">查看账号状态和消息统计。</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-9 px-4 font-medium" asChild>
            <Link to="/dashboard/accounts">账号管理</Link>
          </Button>
          <Button size="sm" className="h-9 px-4 gap-1.5 font-medium shadow-sm" asChild>
            <Link to="/dashboard/accounts">
              <Plus className="h-3.5 w-3.5" /> 添加账号
            </Link>
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className={`grid gap-4 md:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : ""}`}>
        {[
          {
            label: "在线账号",
            value: stats?.online_bots ?? 0,
            sub: `共 ${stats?.total_bots ?? 0} 个`,
            icon: Bot,
            color: "text-foreground",
            bg: "bg-muted",
            badge: (stats?.online_bots ?? 0) > 0,
            link: "/dashboard/accounts",
          },
          {
            label: "消息总量",
            value: stats?.total_messages ?? 0,
            sub: "历史累计",
            icon: MessageSquare,
            color: "text-foreground",
            bg: "bg-muted",
            badge: false,
            link: null,
          },
          {
            label: "已安装应用",
            value: stats?.total_installations ?? 0,
            sub: "个插件",
            icon: Workflow,
            color: "text-foreground",
            bg: "bg-muted",
            badge: false,
            link: null,
          },
          {
            label: "WebSocket 连接",
            value: stats?.connected_ws ?? 0,
            sub: "活跃连接",
            icon: Wifi,
            color: "text-foreground",
            bg: "bg-muted",
            badge: false,
            link: null,
          },
        ]
          // Apps and WebSocket connections are administrator concerns.
          .filter((m) => isAdmin || m.label === "在线账号" || m.label === "消息总量")
          .map((m, i) => (
            <Card
              key={i}
              className={`border-border/50 bg-card/50 hover:bg-card transition-colors${m.link ? " cursor-pointer" : " cursor-default"}`}
              {...(m.link ? { onClick: undefined } : {})}
            >
              {m.link ? (
                <Link to={m.link} className="block">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className={`h-8 w-8 rounded-lg ${m.bg} flex items-center justify-center ${m.color}`}
                      >
                        <m.icon className="h-4 w-4" />
                      </div>
                      {m.badge ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-5 px-1.5 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                        >
                          在线
                        </Badge>
                      ) : null}
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-2xl font-bold tabular-nums">
                        {m.value.toLocaleString()}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-xs font-semibold text-foreground/80">{m.label}</p>
                        <span className="text-[10px] text-muted-foreground">{m.sub}</span>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              ) : (
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`h-8 w-8 rounded-lg ${m.bg} flex items-center justify-center ${m.color}`}
                    >
                      <m.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-2xl font-bold tabular-nums">
                      {m.value.toLocaleString()}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-xs font-semibold text-foreground/80">{m.label}</p>
                      <span className="text-[10px] text-muted-foreground">{m.sub}</span>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
      </div>

      {(stats?.online_bots ?? 0) === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/20 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">暂无在线账号</p>
            <p className="text-xs text-destructive/70 mt-0.5">
              还没有在线的微信账号，请先添加一个。
            </p>
          </div>
          <Button size="sm" variant="destructive" className="shrink-0 h-8 px-3 text-xs" asChild>
            <Link to="/dashboard/accounts">立即添加</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-7">
        {/* Quick Start Roadmap */}
        <Card className="lg:col-span-4 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">快速开始</CardTitle>
                <CardDescription className="text-xs mt-0.5">三步开始使用 Hi微连</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {steps.map((item, i) => (
                <Link
                  key={i}
                  to={item.link}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-muted/40 transition-colors group"
                >
                  <span className="text-xs font-bold tabular-nums text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors w-5 shrink-0">
                    {item.step}
                  </span>
                  <div
                    className={`h-9 w-9 rounded-lg ${item.bg} flex items-center justify-center shrink-0 transition-colors`}
                  >
                    <item.icon className={`h-4 w-4 ${item.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold group-hover:text-primary transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">快捷入口</CardTitle>
              <CardDescription className="text-xs">常用功能直达</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-0">
              {quickLinks.map((item) => (
                <Button
                  key={item.link}
                  variant="outline"
                  className="h-auto flex-col gap-2 py-4 justify-start items-center"
                  asChild
                >
                  <Link to={item.link}>
                    <item.icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
