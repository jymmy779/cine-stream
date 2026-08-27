import { ReactNode } from "react";
import type { Metadata } from "next";
import AdminSidebar from "./AdminSidebar";

export const metadata: Metadata = {
  title: {
    default: "Trang quản trị",
    template: "%s | Quản trị LoFilm",
  },
  description: "Hệ thống quản trị nội dung và vận hành LoFilm.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 md:h-screen md:overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
