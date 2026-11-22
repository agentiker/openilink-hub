import { Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useUser } from "@/hooks/use-auth";
import { useBots } from "@/hooks/use-bots";
import { useAuthStore } from "@/stores/auth-store";
import { HiLogo, HiLogoMark } from "@/components/brand/hi-logo";
import {
  LogOut,
  Bot,
  ShieldCheck,
  Sun,
  Moon,
  ChevronsUpDown,
  Settings2,
  MonitorDot,
  Puzzle,
  Circle,
  House,
  Code2,
} from "lucide-react";
import { api, botDisplayName } from "../lib/api";
import { useTheme } from "../lib/theme";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as React from "react";

function SidebarLogo() {
  const { open } = useSidebar();
  return open ? <HiLogo className="text-base" /> : <HiLogoMark className="size-7" />;
}

const BREADCRUMB_LABELS: Record<string, string> = {
  accounts: "账号管理",
  apps: "应用",
  overview: "概览",
  settings: "设置",
  profile: "个人资料",
  security: "安全",
  admin: "系统管理",
  users: "用户管理",
  reviews: "审核中心",
  traces: "消息追踪",
  developer: "开发者",
  install: "安装应用",
  console: "控制台",
  onboarding: "引导",
};

// Intermediate-only segments that are NOT standalone routes.
// These are skipped in breadcrumbs when followed by a dynamic ID.
const BREADCRUMB_SKIP = new Set(["apps", "install"]);

const statusColors: Record<string, string> = {
  connected: "text-success fill-success",
  disconnected: "text-muted-foreground fill-muted-foreground",
  error: "text-destructive fill-destructive",
  session_expired: "text-destructive fill-destructive",
};

function LayoutHeader() {
  const location = useLocation();
  const { resolvedTheme, setTheme } = useTheme();

  // Build breadcrumbs from path, skipping segments that are intermediate
  // parts of a compound route (e.g. "apps" in /accounts/:id/apps/:iid).
  const rawSegments = location.pathname
    .split("/")
    .filter((s) => Boolean(s) && s !== "dashboard" && s !== "overview");
  const breadcrumbs: { label: string; path: string; isLast: boolean }[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const segment = rawSegments[i];
    const path = `/dashboard/${rawSegments.slice(0, i + 1).join("/")}`;
    // Skip intermediate-only segments (e.g. "apps" in /accounts/:id/apps/:iid)
    if (BREADCRUMB_SKIP.has(segment) && i > 0 && i < rawSegments.length - 1) {
      continue;
    }
    let label = BREADCRUMB_LABELS[segment] || segment;
    if (segment.length > 20) label = "详情";
    breadcrumbs.push({ label, path, isLast: i === rawSegments.length - 1 });
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-2 h-9 w-9" />
        <Separator orientation="vertical" className="h-4 opacity-50" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link
                  to="/dashboard/overview"
                  className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
                >
                  <House className="h-3.5 w-3.5" />
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {breadcrumbs.length > 0 && <BreadcrumbSeparator className="opacity-30" />}
            {breadcrumbs.map((bc, i) => (
              <React.Fragment key={bc.path}>
                {i > 0 && <BreadcrumbSeparator className="opacity-30" />}
                <BreadcrumbItem>
                  {bc.isLast ? (
                    <BreadcrumbPage className="font-medium text-foreground">
                      {bc.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={bc.path} className="transition-colors hover:text-foreground">
                        {bc.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <TooltipProvider>
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>切换外观主题</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </header>
  );
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user, isError } = useUser();
  const { data: bots = [] } = useBots();
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (isError)
      navigate(location.pathname.startsWith("/dashboard/admin") ? "/admin/login" : "/login", {
        replace: true,
      });
  }, [isError, navigate]);

  useEffect(() => {
    api
      .info()
      .then((data) => setVersion(data.version || ""))
      .catch(() => {});
  }, []);

  if (!user) return null;

  const isAdmin = user.role === "admin" || user.role === "superadmin";

  // Logical matching for active states
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon" className="border-r-0 shadow-none">
        <SidebarHeader className="h-16 justify-center">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/dashboard/overview">
                  <SidebarLogo />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {/* Overview */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/dashboard/overview"}
                    tooltip="概览"
                  >
                    <Link to="/dashboard/overview">
                      <MonitorDot />
                      <span>概览</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* 账号管理 */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={isActive("/dashboard/accounts")} tooltip="账号管理">
                    <Bot />
                    <span>账号管理</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        size="sm"
                        isActive={location.pathname === "/dashboard/accounts"}
                      >
                        <Link to="/dashboard/accounts">全部账号</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    {bots.map((b) => (
                      <SidebarMenuSubItem key={b.id}>
                        <SidebarMenuSubButton
                          asChild
                          size="sm"
                          isActive={isActive(`/dashboard/accounts/${b.id}`)}
                        >
                          <Link to={`/dashboard/accounts/${b.id}`}>
                            <Circle
                              className={`size-2 ${statusColors[b.status] || "text-muted-foreground"}`}
                            />
                            <span className="truncate">{botDisplayName(b)}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* 应用市场 / 开发者 — administrator console only */}
          {isAdmin && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/dashboard/apps")}
                      tooltip="应用市场"
                    >
                      <Link to="/dashboard/apps">
                        <Puzzle />
                        <span>应用市场</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          {isAdmin && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/dashboard/developer")}
                      tooltip="开发者"
                    >
                      <Link to="/dashboard/developer/apps">
                        <Code2 />
                        <span>开发者</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* 管理 — admin only */}
          {isAdmin && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={isActive("/dashboard/admin")} tooltip="管理">
                      <ShieldCheck />
                      <span>管理</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          size="sm"
                          isActive={location.pathname === "/dashboard/admin/overview"}
                        >
                          <Link to="/dashboard/admin/overview">系统概览</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          size="sm"
                          isActive={isActive("/dashboard/admin/users")}
                        >
                          <Link to="/dashboard/admin/users">用户管理</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          size="sm"
                          isActive={isActive("/dashboard/admin/bots")}
                        >
                          <Link to="/dashboard/admin/bots">Bot 管理</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          size="sm"
                          isActive={isActive("/dashboard/admin/reviews")}
                        >
                          <Link to="/dashboard/admin/reviews">审核中心</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive("/dashboard/settings")}
                tooltip="个人设置"
              >
                <Link to="/dashboard/settings/profile">
                  <Settings2 />
                  <span>偏好设置</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarSeparator className="mx-0" />
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg shadow-sm border border-border/50">
                      <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold text-xs">
                        {user.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight ml-1">
                      <span className="truncate font-semibold">{user.username}</span>
                      <span className="truncate text-[10px] text-muted-foreground font-medium uppercase">
                        {user.role}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 opacity-50" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-xl shadow-2xl"
                  side="top"
                  align="end"
                  sideOffset={8}
                >
                  <DropdownMenuItem
                    onClick={async () => {
                      const wasAdmin = isAdmin;
                      await useAuthStore.getState().logout();
                      // Full page load, not navigate(): this menu (and on mobile
                      // the sidebar sheet) is still open, and unmounting Radix
                      // overlays mid-open leaves pointer-events:none on <body>,
                      // making the login page unclickable. A reload also drops
                      // the previous account's cached data.
                      window.location.replace(wasAdmin ? "/admin/login" : "/login");
                    }}
                    className="cursor-pointer font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    退出登录
                  </DropdownMenuItem>
                  {version && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] text-muted-foreground text-center font-normal">
                        {/^\d/.test(version) ? `v${version}` : version}
                      </DropdownMenuLabel>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="flex flex-col bg-background/50 rounded-tl-2xl overflow-hidden">
        <LayoutHeader />

        <main className="flex-1 overflow-y-auto overflow-x-hidden [&:has([data-full-page])]:overflow-hidden">
          <div className="h-full mx-auto w-full max-w-[1400px] p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500 [&:has([data-full-page])]:p-0 [&:has([data-full-page])]:max-w-none">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
