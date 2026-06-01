import localFont from "next/font/local";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { ShowcaseHeader } from "@/components/ShowcaseHeader";
import { ClerkProvider } from '@clerk/nextjs';

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", weight: ["400", "500", "600"] });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", weight: ["400", "500", "600"] });
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata = {
  title: 'Composed',
  description: 'A guided wizard that produces LLM-tuned study prompts for Pomfret students.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#586249',
          fontFamily: 'var(--font-inter)',
          borderRadius: '0.75rem',
        },
      }}
    >
      <html lang="en">
        <body className={`${inter.variable} ${newsreader.variable} ${geistMono.variable} font-sans antialiased`}>
          <ShowcaseHeader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
