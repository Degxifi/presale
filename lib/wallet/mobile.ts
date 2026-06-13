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
  // Installed = injected and ready; Loadable = present but still registering.
  // Accept either so an injecting in-app wallet (Phantom/Solflare browser) isn't
  // briefly treated as "no wallet" and shown the redirect sheet before it flips
  // to Installed.
  return !wallets.some(
    (w) =>
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable,
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
