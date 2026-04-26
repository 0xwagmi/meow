import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "meow bridge",
  description: "USDC bridge between Solana and EVM chains via Circle CCTP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body
        className="antialiased bg-slate-950 text-white"
        // style={{
        //   fontFamily:
        //     '"DepartureMono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        // }}
      >
        <ErrorBoundary>
          <Providers>{children}</Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
