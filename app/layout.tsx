import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Overpayment Auditor",
  description: "Finds money a company has overpaid its suppliers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
