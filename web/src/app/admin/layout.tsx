import { requireRole } from "@/lib/auth";
import { AdminNav } from "./nav";
import { classesEnabled } from "@/lib/settings";

/** Every /admin route is admin-only and shares the sidebar. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireRole("ADMIN");
  const useClasses = await classesEnabled();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row dark:bg-gray-950">
      <AdminNav email={admin.email} useClasses={useClasses} />
      <div className="min-w-0 flex-1">
        <div className="p-6 lg:px-10 lg:pt-7.5 lg:pb-11">{children}</div>
      </div>
    </div>
  );
}
