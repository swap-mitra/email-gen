import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "email_gen",
  description: "Modernized outreach workflow foundation built during Sprint 0.",
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
