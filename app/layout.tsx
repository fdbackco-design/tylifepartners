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
      <head>
        {/* Danggeun Market Code */}
        <script src="https://karrot-pixel.business.daangn.com/karrot-pixel.js" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.karrotPixel.init('1770948465060765001');
              window.karrotPixel.track('ViewPage');
            `,
          }}
        />
        {/* End Danggeun Market Code */}
      </head>
      <body>{children}</body>
    </html>
  );
}
