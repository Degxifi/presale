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
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Quests", href: "/quests" },
  { label: "FAQ", href: "/faq" },
];

export type SocialKey = "x" | "telegram" | "discord";
export type SocialLink = { label: string; href: string; key: SocialKey };

// TODO: set real handles/URLs before launch
export const socialLinks: SocialLink[] = [
  { label: "X / Twitter", href: "#", key: "x" },
  { label: "Telegram", href: "#", key: "telegram" },
  { label: "Discord", href: "#", key: "discord" },
];
