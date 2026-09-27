import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Overpayment Auditor",
    template: "%s · Overpayment Auditor",
  },
  description: "Finds money a company has overpaid its suppliers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
