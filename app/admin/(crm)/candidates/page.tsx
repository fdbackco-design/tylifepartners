"use client";
import LeadList from "@/app/admin/_components/LeadList";

export default function CandidatesPage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>후보자 DB</h1>
      <LeadList category="candidates" />
    </div>
  );
}
