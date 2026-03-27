import { NavLink } from "react-router-dom";
import { Activity, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/tenants", icon: Building2, label: "Tenants" },
  { to: "/log", icon: Activity, label: "Activity Log" },
];

const AppSidebar = () => (
  <aside className="w-56 bg-sidebar min-h-screen p-4 flex flex-col gap-1">
    <h1 className="text-lg font-bold text-white mb-6 px-2">CloudyPDF</h1>
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
  </aside>
);

export default AppSidebar;
