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
        {/* Google tag (gtag.js) */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-QG36NWBQWE" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-QG36NWBQWE');
            `,
          }}
        />
        {/* Meta Pixel Code */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1500184178393418');
fbq('track', 'PageView');
            `,
          }}
        />
        {/* End Meta Pixel Code */}
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
      <body>
        <noscript
          dangerouslySetInnerHTML={{
            __html:
              '<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=1500184178393418&ev=PageView&noscript=1" alt="" />',
          }}
        />
        {children}
      </body>
    </html>
  );
}
