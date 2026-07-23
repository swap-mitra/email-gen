import type { Metadata } from "next";
import { Providers } from "@/components/theme-provider";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Groundwork",
  description:
    "Do the groundwork before you say a word. Turn a company or hiring URL into a structured opportunity, ground the message in your team's proof points, and route every draft through a reviewable workspace workflow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Sets data-theme before hydration — prevents a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
