"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const FLAG_KEY = "consultation_submitted";

export default function CompletePage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined" && sessionStorage.getItem(FLAG_KEY) === "1";
    if (!ok) {
      router.replace("/");
      return;
    }
    sessionStorage.removeItem(FLAG_KEY); // bonus: 1회만 허용
    setAllowed(true);
  }, [router]);

  if (!allowed) return null;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#fff",
      }}
    >
      <img
        src="/assets/complete.png"
        alt="상담 신청 완료"
        style={{
          width: "100%",
          maxWidth: 420,
          height: "auto",
          display: "block",
        }}
      />
    </main>
  );
}

