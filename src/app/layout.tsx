import { PageFlow } from "@/components/site/PageFlow";
import type { Metadata } from "next";
import { Geist_Mono, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PageCrafts — craft. publish. impact.",
  description:
    "Build a real website by describing it. No code, nothing to install. Free to build and go live on PageCrafts; Pro and Premium unlock richer looks.",
  icons: {
    // Square PC mark — browsers (and Chrome's address bar) prefer /favicon.ico
    // and square icons; the wide lockup is kept for Open Graph only.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/pagecrafts-mark.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/brand/pagecrafts-mark.png",
  },
  openGraph: {
    title: "PageCrafts — craft. publish. impact.",
    description:
      "Build a real website by describing it. No code, nothing to install. Free to build and go live on PageCrafts; Pro and Premium unlock richer looks.",
    images: ["/brand/pagecrafts-lockup.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${plusJakarta.variable} ${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <PageFlow>{children}</PageFlow>
      </body>
    </html>
  );
}
