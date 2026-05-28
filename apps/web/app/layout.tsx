import localFont from "next/font/local";
import "./globals.css";
import { ShowcaseHeader } from "@/components/ShowcaseHeader";
import { ClerkProvider } from '@clerk/nextjs';

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
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
          colorPrimary: '#4f46e5',
          fontFamily: 'var(--font-geist-sans)',
        },
      }}
    >
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ShowcaseHeader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
