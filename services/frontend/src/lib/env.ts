// The BFF base URL depends on *where* the fetch runs:
//   • Server (RSC / route handlers) reach the BFF over the Docker network.
//   • Browser code reaches it via the published host port.
// Both are overridable by env so the same image runs in other topologies.
export const BFF_SERVER_URL =
  process.env.BFF_INTERNAL_URL ?? "http://bff:8080";

export const BFF_BROWSER_URL =
  process.env.NEXT_PUBLIC_BFF_URL ?? "http://localhost:9001";

/** Pick the correct BFF base for the current execution context. */
export function bffBaseUrl(): string {
  return typeof window === "undefined" ? BFF_SERVER_URL : BFF_BROWSER_URL;
}

// Identity for the (not-yet-wired) auth service. Until Zitadel lands we operate
// as a single demo shopper — and it must be a REAL Users-service account, not a
// placeholder, because checkout is gated on the account existing and the account
// page lists this id's order history. This is the seeded shopper Ada Lovelace
// (services/users/app/seed.sql); cart, checkout and order history all key off it.
export const DEMO_USER_ID =
  process.env.NEXT_PUBLIC_DEMO_USER_ID ??
  "11111111-1111-1111-1111-111111111111";

// Until auth lands, the account page resolves a single seeded demo shopper by
// email (services/users/app/seed.sql). This is the "signed-in" identity the
// account page renders; real sign-in arrives with Zitadel.
export const DEMO_ACCOUNT_EMAIL =
  process.env.NEXT_PUBLIC_DEMO_ACCOUNT_EMAIL ?? "ada@shoeshop.test";
