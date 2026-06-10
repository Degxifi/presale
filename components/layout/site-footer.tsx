import Image from "next/image";
import Link from "next/link";
import type { SVGProps } from "react";
import { Container } from "@/components/ui/container";
import { mainNav, siteConfig, socialLinks, type SocialKey } from "@/config/site";

// Brand glyphs (lucide has no brand icons). Minimal inline paths.
function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}
function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127c-.598.349-1.225.645-1.873.892a.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

const socialIcon: Record<SocialKey, (p: SVGProps<SVGSVGElement>) => React.ReactNode> = {
  x: XIcon,
  telegram: TelegramIcon,
  discord: DiscordIcon,
};

export function SiteFooter() {
  const year = 2026; // bump or compute at build time when needed

  return (
    <footer className="mt-24 border-t border-border/60 bg-surface/30">
      <Container className="py-14">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          {/* Brand */}
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="Degxifi" width={28} height={28} className="size-7" />
              <span className="font-display text-lg font-bold tracking-tight">
                <span className="text-accent">$</span>DEGX
              </span>
            </Link>
            <p className="mt-3 text-sm text-muted">{siteConfig.description}</p>

            <div className="mt-5 flex items-center gap-2">
              {socialLinks.map((s) => {
                const Icon = socialIcon[s.key];
                return (
                  <a
                    key={s.key}
                    href={s.href}
                    aria-label={s.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-foreground"
                  >
                    <Icon className="size-4" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Nav */}
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-3">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Risk disclaimer (compliance — appears site-wide) */}
        <p className="mt-12 border-t border-border/60 pt-6 text-xs leading-relaxed text-muted">
          Cryptocurrency involves substantial risk — you may lose your entire
          contribution. $DEGX is a utility/access token with no promise of profit;
          any ROI figures are illustrative and conditional, not guaranteed.
          Contributions are non-refundable once confirmed on-chain. Nothing here is
          financial advice. USDC on Solana only. Not available where prohibited.
        </p>

        <div className="mt-6 flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} Degxifi. All rights reserved.
          </span>
          <span>Solana · USDC · Graduates to Jupiter Studio</span>
        </div>
      </Container>
    </footer>
  );
}
