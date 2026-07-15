import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Email GenAI — Outbound Workflow Platform",
  description:
    "Turn a company or hiring URL into a structured opportunity, ground the message in your team's proof points, and route every draft through a reviewable workspace workflow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
