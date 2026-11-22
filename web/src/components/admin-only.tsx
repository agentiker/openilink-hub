import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";

/**
 * Administrator-console pages (apps, developer, message console, traces,
 * app installs, admin pages). Regular users get the simplified user side and
 * are sent back to the bot page (if the URL is about one) or the overview.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const { id } = useParams<{ id: string }>();
  if (!user) return null; // Layout renders routes only after the user is loaded
  if (isAdminRole(user.role)) return <>{children}</>;
  return <Navigate to={id ? `/dashboard/accounts/${id}` : "/dashboard/overview"} replace />;
}
