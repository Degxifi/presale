import { WalletReadyState } from "@solana/wallet-adapter-base";

/** Coarse mobile-browser sniff (client only). */
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS Safari defaults to a DESKTOP ("Macintosh") UA, so the plain regex
  // misses it — detect via touch points (real Macs report maxTouchPoints 0).
  // Exclude Windows (touch laptops have their own UA) and cap the touch-point
  // count (iPads report ~5) so a touchscreen desktop can't be misclassified.
  const iPadOS =
    /Macintosh/.test(ua) &&
    !/Windows/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1 &&
    navigator.maxTouchPoints <= 10;
  return /Android|iPhone|iPad|iPod/i.test(ua) || iPadOS;
}

/**
 * The auto-registered Android adapter. On a plain mobile browser it "detects"
 * itself even when no real wallet is injected, and its connect flow is the slow,
 * unbranded Mobile-Wallet-Adapter modal. We deliberately do NOT treat it as a
 * real injected wallet (see needsInAppBrowser), so plain mobile browsers get our
 * branded "open in Phantom/Solflare" sheet instead. Name per
 * @solana-mobile/wallet-adapter-mobile (SolanaMobileWalletAdapterWalletName).
 */
const MOBILE_WALLET_ADAPTER = "Mobile Wallet Adapter";

/**
 * True on a mobile browser with NO real injected wallet — show our branded sheet
 * that opens the site inside a wallet's in-app browser (where the wallet injects
 * and connect/sign work natively + fast). Two cases route here:
 *  1. A plain mobile browser where only the Mobile Wallet Adapter is "detected"
 *     (we exclude it — its modal is slow + unbranded; the deep-link is better).
 *  2. No wallet at all.
 * Inside a wallet's in-app browser a REAL wallet is Installed/Loadable (and its
 * name isn't "Mobile Wallet Adapter"), so this returns false → normal connect.
 */
export function needsInAppBrowser(
  wallets: readonly { readyState: WalletReadyState; adapter: { name: string } }[],
): boolean {
  if (!isMobileBrowser()) return false;
  // A "real" wallet = injected (Installed) or registering (Loadable) AND not the
  // Mobile Wallet Adapter. If none qualify, show the branded deep-link sheet.
  return !wallets.some(
    (w) =>
      w.adapter.name !== MOBILE_WALLET_ADAPTER &&
      (w.readyState === WalletReadyState.Installed ||
        w.readyState === WalletReadyState.Loadable),
  );
}

/**
 * "Browse" universal links that open `targetUrl` inside each wallet's in-app
 * browser. Both wallets' docs specify the <url> path segment URL-encoded:
 *  - Phantom:  https://phantom.app/ul/browse/<enc-url>?ref=<enc-ref>
 *  - Solflare: https://solflare.com/ul/v1/browse/<enc-url>?ref=<enc-ref>
 * Jupiter Mobile has no documented browse link, so it uses the copy-link path.
 */
export function walletBrowseLinks(targetUrl: string) {
  const enc = encodeURIComponent(targetUrl);
  const ref = enc;
  return {
    phantom: `https://phantom.app/ul/browse/${enc}?ref=${ref}`,
    solflare: `https://solflare.com/ul/v1/browse/${enc}?ref=${ref}`,
  };
}
