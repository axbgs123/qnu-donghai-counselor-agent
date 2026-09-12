import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3001";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const description =
    "面向泉州师范学院东海校区教师与辅导员的校园事务智能体平台。";

  return {
    metadataBase,
    title: {
      default: "泉师智辅｜东海校区辅导员工作台",
      template: "%s｜泉师智辅",
    },
    description,
    openGraph: {
      title: "泉师智辅｜东海校区辅导员工作台",
      description,
      type: "website",
      locale: "zh_CN",
      images: [
        {
          url: new URL("/og.png", metadataBase).toString(),
          width: 1729,
          height: 910,
          alt: "东海校区辅导员智能工作台",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "泉师智辅｜东海校区辅导员工作台",
      description,
      images: [new URL("/og.png", metadataBase).toString()],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
