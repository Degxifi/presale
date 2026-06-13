import { WalletReadyState } from "@solana/wallet-adapter-base";

/** Coarse mobile-browser sniff (client only). */
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * True on a mobile browser with NO injected/installed wallet — the case where
 * the wallet-adapter modal's mobile deep-link hand-off misfires (e.g. it routes
 * to Jupiter Mobile and lands on a jup.ag 404). In that state we should instead
 * send the user into a wallet's in-app browser (where the wallet injects and
 * connect/sign work natively). Inside a wallet's in-app browser the wallet IS
 * installed, so this returns false and the normal connect flow is used.
 */
export function needsInAppBrowser(
  wallets: readonly { readyState: WalletReadyState }[],
): boolean {
  if (!isMobileBrowser()) return false;
  return !wallets.some((w) => w.readyState === WalletReadyState.Installed);
}

/**
 * "Browse" universal links that open `targetUrl` inside each wallet's in-app
 * browser. Formats per the wallets' own docs:
 *  - Phantom:  https://phantom.app/ul/browse/<url>?ref=<ref>   (url appended raw)
 *  - Solflare: https://solflare.com/ul/v1/browse/<enc-url>?ref=<enc-ref>
 * Jupiter Mobile has no documented browse link, so it uses the copy-link path.
 */
export function walletBrowseLinks(targetUrl: string) {
  const ref = encodeURIComponent(targetUrl);
  return {
    phantom: `https://phantom.app/ul/browse/${targetUrl}?ref=${ref}`,
    solflare: `https://solflare.com/ul/v1/browse/${encodeURIComponent(targetUrl)}?ref=${ref}`,
  };
}
