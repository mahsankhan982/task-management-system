import { createPublicKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS: [string, ...string[]] = [
  "accounts.google.com",
  "https://accounts.google.com",
];

type GoogleJwk = {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
};

export type GoogleProfile = {
  google_id: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  picture: string | null;
};

let cachedKeys = new Map<string, GoogleJwk>();
let cacheExpiresAt = 0;

/**
 * Google rotates its signing keys, so the key set is cached until the
 * Cache-Control max-age it advertises expires, then refetched on demand.
 */
async function getSigningKey(kid: string): Promise<GoogleJwk> {
  const cached = cachedKeys.get(kid);

  if (cached && Date.now() < cacheExpiresAt) {
    return cached;
  }

  const response = await fetch(GOOGLE_CERTS_URL);

  if (!response.ok) {
    throw new Error(`Unable to fetch Google signing keys (${response.status})`);
  }

  const body = (await response.json()) as { keys?: GoogleJwk[] };
  const keys = body.keys ?? [];

  const maxAge = Number(
    /max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1]
  );

  cachedKeys = new Map(keys.map((key) => [key.kid, key]));
  cacheExpiresAt = Date.now() + (Number.isFinite(maxAge) ? maxAge : 3600) * 1000;

  const key = cachedKeys.get(kid);

  if (!key) {
    throw new Error("Google token was signed with an unknown key");
  }

  return key;
}

export function isGoogleSignInConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID);
}

/**
 * Verifies a Google Identity Services ID token locally against Google's
 * published JWKS and returns the profile it asserts.
 */
export async function verifyGoogleIdToken(
  credential: string
): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("Google sign-in is not configured");
  }

  const decoded = jwt.decode(credential, { complete: true });
  const kid = decoded?.header?.kid;

  if (!decoded || typeof kid !== "string") {
    throw new Error("Malformed Google token");
  }

  const jwk = await getSigningKey(kid);
  const publicKey = createPublicKey({ key: jwk as never, format: "jwk" });

  const payload = jwt.verify(credential, publicKey, {
    algorithms: ["RS256"],
    audience: env.GOOGLE_CLIENT_ID,
    issuer: GOOGLE_ISSUERS,
  }) as jwt.JwtPayload;

  const email = typeof payload.email === "string" ? payload.email.trim() : "";

  if (!email || !payload.sub) {
    throw new Error("Google token is missing an email address");
  }

  return {
    google_id: String(payload.sub),
    email,
    email_verified: payload.email_verified === true,
    full_name:
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : email,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}
