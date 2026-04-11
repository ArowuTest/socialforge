import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ChiselPost",
    template: "%s | ChiselPost",
  },
  description:
    "Schedule, create, and analyse your social media content across every platform — powered by AI.",
  keywords: ["social media", "scheduling", "content creation", "AI", "analytics"],
  authors: [{ name: "ChiselPost" }],
  creator: "ChiselPost",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "ChiselPost",
    description: "Schedule, create, and analyse your social media content",
    siteName: "ChiselPost",
  },
  twitter: {
    card: "summary_large_image",
    title: "ChiselPost",
    description: "Schedule, create, and analyse your social media content",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ReactQueryProvider>
            {children}
          </ReactQueryProvider>
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            duration={4000}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
