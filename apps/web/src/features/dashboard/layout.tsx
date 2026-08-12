import Sidebar from "@/components/layout/sidebar";
import TopHeader from "@/components/layout/top-header";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#f6f7fb]">
      <div className="flex min-h-screen">
        <Sidebar />

        <div className="min-w-0 flex-1">
          <TopHeader />

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}