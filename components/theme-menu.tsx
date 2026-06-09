"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";

type ThemePreference = "light" | "dark" | "system";

const options = [
  { value: "light" as const, label: "Sáng", description: "Giao diện nền sáng", icon: Sun },
  { value: "dark" as const, label: "Tối", description: "Giao diện nền tối", icon: Moon },
  { value: "system" as const, label: "Hệ thống", description: "Theo cài đặt thiết bị", icon: Monitor },
];

export function ThemeMenu() {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const ActiveIcon = options.find((option) => option.value === theme)?.icon || Monitor;

  useEffect(() => {
    const saved = (window.localStorage.getItem("signal-theme") || "system") as ThemePreference;
    setTheme(saved);
    applyTheme(saved);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystem = () => {
      if ((window.localStorage.getItem("signal-theme") || "system") === "system") applyTheme("system");
    };
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    media.addEventListener("change", syncSystem);
    document.addEventListener("mousedown", close);
    return () => {
      media.removeEventListener("change", syncSystem);
      document.removeEventListener("mousedown", close);
    };
  }, []);

  function changeTheme(value: ThemePreference) {
    setTheme(value);
    setOpen(false);
    window.localStorage.setItem("signal-theme", value);
    applyTheme(value);
  }

  return <div className="theme-menu" ref={menuRef}>
    <button className={`icon-btn theme-menu-trigger ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)} aria-label="Chọn giao diện" aria-expanded={open} title="Giao diện">
      <ActiveIcon size={16} />
    </button>
    {open && <div className="theme-menu-popover" role="menu">
      <div className="theme-menu-title"><b>Giao diện</b><span>Tùy chỉnh cách Signal hiển thị</span></div>
      {options.map(({ value, label, description, icon: Icon }) => <button key={value} className={theme === value ? "active" : ""} onClick={() => changeTheme(value)} role="menuitem">
        <span className="theme-option-icon"><Icon size={15} /></span><span><b>{label}</b><small>{description}</small></span>{theme === value && <Check size={14} />}
      </button>)}
    </div>}
  </div>;
}

function applyTheme(preference: ThemePreference) {
  const resolved = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = preference;
  document.documentElement.dataset.colorScheme = resolved;
}
