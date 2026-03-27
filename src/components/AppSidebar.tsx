import { NavLink } from "react-router-dom";
import { Upload, FileSearch, Mail, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", icon: Upload, label: "Upload" },
  { to: "/review", icon: FileSearch, label: "Review" },
  { to: "/email-mappings", icon: Mail, label: "Email Mappings" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const AppSidebar = () => (
  <aside className="w-56 border-r bg-sidebar min-h-screen p-4 flex flex-col gap-1">
    <h1 className="text-lg font-bold text-sidebar-foreground mb-6 px-2">ConsignmentBuilder</h1>
    {links.map(({ to, icon: Icon, label }) => (
      <NavLink
        key={to}
        to={to}
        end={to === "/"}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
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
