import AdminShell from "@/app/admin/_components/AdminShell";

export default function LandingsLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
