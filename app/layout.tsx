import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "상담 신청",
  description: "상담 신청을 위한 랜딩 페이지",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
