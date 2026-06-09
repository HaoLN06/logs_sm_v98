"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BarChart3, Bug, FileSearch, FileText, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";

const workspaceItems = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/analysis", label: "Phân tích log", icon: FileSearch },
  { href: "/trends", label: "Xu hướng", icon: BarChart3 },
];

const upcomingItems = [
  { label: "Nhóm sự cố", icon: Bug },
  { label: "Tệp đã tải", icon: FileText },
  { label: "Cấu hình parser", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("signal-sidebar-collapsed") === "true";
    setCollapsed(saved);
    document.documentElement.dataset.sidebarCollapsed = String(saved);
  }, []);

  function toggleSidebar() {
    setCollapsed((value) => {
      const next = !value;
      document.documentElement.dataset.sidebarCollapsed = String(next);
      window.localStorage.setItem("signal-sidebar-collapsed", String(next));
      return next;
    });
  }

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <div className="brand-mark"><Activity size={19} /></div>
        <div className="brand-copy"><strong>Signal</strong><span>LOG INTELLIGENCE</span></div>
      </div>
      <div className="nav-label">Workspace</div>
      {workspaceItems.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} data-tooltip={label} aria-label={label} className={`nav-item ${pathname === href ? "active" : ""}`}>
          <Icon size={15} /><span>{label}</span>
        </Link>
      ))}
      <div className="nav-label">Sắp phát triển</div>
      {upcomingItems.map(({ label, icon: Icon }) => (
        <button key={label} className="nav-item nav-disabled" data-tooltip={`${label} · Sắp phát triển`} aria-label={`${label}, sắp phát triển`} disabled title="Tính năng đang được phát triển">
          <Icon size={15} /><span>{label}</span>
        </button>
      ))}
      <div className="sidebar-foot">
        <div><i className="system-dot" />Parser đang hoạt động</div>
        <span>Service Manager 9.80 preset</span>
      </div>
      <button className="sidebar-toggle" onClick={toggleSidebar} aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"} title={collapsed ? "Mở rộng" : "Thu gọn"}>
        {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}<span>{collapsed ? "Mở rộng" : "Thu gọn"}</span>
      </button>
    </aside>
  );
}
