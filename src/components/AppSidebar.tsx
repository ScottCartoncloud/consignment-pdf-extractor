import { NavLink } from "react-router-dom";
import { Activity, Building2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const links = [
  { to: "/tenants", icon: Building2, label: "Tenants" },
  { to: "/log", icon: Activity, label: "Activity Log" },
];

const AppSidebar = () => {
  const { user, signOut } = useAuth();

  return (
    <aside className="w-56 bg-sidebar min-h-screen p-4 flex flex-col">
      <h1 className="text-lg font-bold text-white mb-6 px-2">CloudyPDF</h1>
      <div className="flex flex-col gap-1 flex-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-accent"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/30"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </div>
      <div className="mt-auto pt-4 border-t border-sidebar-accent/30">
        <p className="text-xs text-sidebar-foreground/60 px-3 mb-2 truncate">
          {user?.email}
        </p>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/30 transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
