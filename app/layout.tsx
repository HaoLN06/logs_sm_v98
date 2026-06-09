import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Log Analytics",
  description: "Phân tích và theo dõi log Service Manager",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <head><script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.sidebarCollapsed=localStorage.getItem("signal-sidebar-collapsed")==="true"?"true":"false";var t=localStorage.getItem("signal-theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=t;document.documentElement.dataset.colorScheme=d?"dark":"light"}catch(e){}` }} /></head>
      <body>{children}</body>
    </html>
  );
}
