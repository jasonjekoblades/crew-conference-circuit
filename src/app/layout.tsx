import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import { Footer } from "@/components/footer";
import "./globals.css";

const bodyFont = Inter({
  variable: "--font-body-loaded",
  subsets: ["latin"],
});

const headingFont = Newsreader({
  variable: "--font-heading-loaded",
  subsets: ["latin"],
  style: ["normal"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CREW Conference Circuit",
  description: "See which conferences other CREW members are attending, and meet up.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101e33",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${headingFont.variable} antialiased`}>
        {children}
        <Footer />
      </body>
    </html>
  );
}
