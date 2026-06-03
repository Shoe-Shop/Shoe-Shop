import type { Metadata } from "next";
import { Inter, Oswald, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/chrome/site-header";
import { SiteFooter } from "@/components/chrome/site-footer";
import { SkinSwitcher } from "@/components/skin/skin-switcher";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartDrawer } from "@/components/cart/cart-drawer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "900"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "NEXUS — High Performance Footwear",
    template: "%s · NEXUS",
  },
  description:
    "NEXUS — performance and lifestyle footwear, engineered. Shop trainers, trail, court and recovery silhouettes from our house brands.",
};

// Apply the persisted skin before first paint to avoid a flash. Defaults to
// "kinetic" (matches the server render).
const NO_FLASH_SKIN = `(function(){try{var s=localStorage.getItem("nexus-skin");if(s){document.documentElement.dataset.skin=s;}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-skin="kinetic"
      suppressHydrationWarning
      className={`${inter.variable} ${oswald.variable} ${fraunces.variable} ${jetbrains.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SKIN }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <CartProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <CartDrawer />
          <SkinSwitcher />
        </CartProvider>
      </body>
    </html>
  );
}
