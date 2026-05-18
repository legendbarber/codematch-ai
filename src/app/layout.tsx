import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeMatch AI",
  description: "AI 기반 개발 문서-코드 정합성 검증 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
