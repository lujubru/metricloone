"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const BARE_ROUTES = ["/login"];

/** Layout de la app: el login se muestra sin sidebar ni topbar. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBare = BARE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (isBare) return <>{children}</>;

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Topbar />
        <div className="page-content">{children}</div>
      </div>
    </div>
  );
}
