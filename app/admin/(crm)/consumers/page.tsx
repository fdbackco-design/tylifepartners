"use client";
import LeadList from "@/app/admin/_components/LeadList";

export default function ConsumersPage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>소비자 DB</h1>
      <LeadList category="consumers" />
    </div>
  );
}
