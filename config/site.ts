/** Site chrome config — single place to edit nav, brand, and social links. */

export const siteConfig = {
  name: "$DEGX Presale",
  shortName: "$DEGX",
  description:
    "Three-tier USDC community presale on Solana, graduating to Jupiter Studio at a $600K market cap.",
  url: "https://presale.degxifi.com",
};

export type NavItem = { label: string; href: string };

export const mainNav: NavItem[] = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "Tokenomics", href: "/tokenomics" },
  { label: "Claim", href: "/claim" },
  { label: "FAQ", href: "/faq" },
];

export type SocialKey = "x" | "telegram" | "discord";
export type SocialLink = { label: string; href: string; key: SocialKey };

export const socialLinks: SocialLink[] = [
  { label: "X / Twitter", href: "https://x.com/degxifi", key: "x" },
  { label: "Telegram", href: "https://t.me/degxifi", key: "telegram" },
  { label: "Discord", href: "https://discord.gg/qwNZDKcFY", key: "discord" },
];
