import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { LocaleProvider } from "@/components/providers/LocaleProvider";
import { ChunkErrorReloader } from "@/components/providers/ChunkErrorReloader";
import "./globals.css";

export const metadata: Metadata = {
  title: "汽车物流TMS",
  description: "汽车物流运输管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AntdRegistry>
          <ChunkErrorReloader />
          <LocaleProvider>{children}</LocaleProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
