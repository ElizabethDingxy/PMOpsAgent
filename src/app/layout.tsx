import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "PMOpsAgent",
  description: "AI product manager agent demo for turning feedback into PRD and tasks.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="dark scroll-smooth">
      <body className="bg-[#080b11] text-slate-100 antialiased">{children}</body>
    </html>
  )
}
