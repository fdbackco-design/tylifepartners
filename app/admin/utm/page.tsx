"use client";

import AdminShell from "@/app/admin/_components/AdminShell";
import UtmLinkPanel from "@/app/admin/_components/UtmLinkPanel";

export default function UtmPage() {
  return (
    <AdminShell>
      <h1 style={{ marginTop: 0 }}>UTM 링크</h1>
      <UtmLinkPanel />
    </AdminShell>
  );
}
