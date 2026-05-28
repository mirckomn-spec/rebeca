import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const poppinsSemiBold = localFont({
  src: "../../fontes/Poppins-SemiBold/Poppins-SemiBold.ttf",
  variable: "--font-poppins-semi",
  display: "swap",
});

const poppinsBold = localFont({
  src: "../../fontes/Poppins-Bold/Poppins-Bold.ttf",
  variable: "--font-poppins-bold",
  display: "swap",
});

const poppinsExtraBold = localFont({
  src: "../../fontes/Poppins-ExtraBold/Poppins-ExtraBold.ttf",
  variable: "--font-poppins-extra",
  display: "swap",
});

function getProductionSiteUrl() {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production}`;
  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment}`;
  const custom = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (custom) return custom.replace(/\/$/, "");
  return undefined;
}

const siteUrl = getProductionSiteUrl();

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: "Hots",
  description: "Area privada.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  referrer: "strict-origin-when-cross-origin",
  applicationName: undefined,
  generator: undefined,
  formatDetection: { telephone: false, email: false, address: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${poppinsSemiBold.variable} ${poppinsBold.variable} ${poppinsExtraBold.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
