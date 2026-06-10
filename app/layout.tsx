import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Body font (brief §7: "Inter or Space Grotesk")
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Display font for headings and key numbers
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://presale.degxifi.com"),
  title: {
    default: "$DEGX Presale — Degxifi Token on Solana",
    template: "%s · $DEGX Presale",
  },
  description:
    "Join the $DEGX community presale on Solana. Three tiers, below-market entry, " +
    "graduating to Jupiter Studio at a $600K market cap.",
  applicationName: "$DEGX Presale",
  keywords: ["DEGX", "Degxifi", "Solana", "presale", "Jupiter Studio", "USDC"],
  openGraph: {
    title: "$DEGX Presale — Degxifi Token on Solana",
    description:
      "Three-tier community presale. Below-market entry before the Jupiter Studio launch.",
    siteName: "$DEGX Presale",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "$DEGX Presale — Degxifi Token on Solana",
    description:
      "Three-tier community presale. Below-market entry before the Jupiter Studio launch.",
  },
  robots: { index: true, follow: true },
};

// Theme color matches each mode's background for a seamless browser chrome
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
