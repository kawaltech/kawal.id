import { defineAuth } from "void/auth";

// Google is the only sign-in method. Void's `auth.providers` setting is not used:
// with "google" listed, Void throws on every request (including /healthz) when the
// credentials are missing. This file adds Google only when its settings exist, so a
// checkout without credentials still starts, and sign-in fails closed.

const GOOGLE = "google";

// Better Auth endpoints that this application must not expose. Email/password is
// also disabled below; these paths stay closed if a default changes.
const DISABLED_PATHS = [
  "/sign-in/email",
  "/sign-up/email",
  "/link-social",
  "/unlink-account",
  "/update-user",
  "/change-email",
  "/change-password",
  "/set-password",
  "/request-password-reset",
  "/reset-password",
  "/verify-email",
  "/send-verification-email",
  "/delete-user",
  "/get-access-token",
  "/refresh-token",
  "/account-info",
];

function readString(env: Record<string, unknown>, key: string) {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Returns the origin when `value` is a bare https origin, otherwise undefined. */
function httpsOrigin(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

// Vite replaces this in builds. Node loads this file directly to read the schema,
// where `import.meta.env` does not exist.
const isDevelopment = import.meta.env?.DEV === true;

export default defineAuth(({ defaults, env, request }) => {
  // A deployed Worker uses only the configured origin for callbacks, redirects and
  // origin checks. Development uses the request origin.
  const deployedOrigin = httpsOrigin(readString(env, "AUTH_BASE_URL"));
  const origin = isDevelopment ? undefined : deployedOrigin;
  const clientId = readString(env, "AUTH_GOOGLE_CLIENT_ID");
  const clientSecret = readString(env, "AUTH_GOOGLE_CLIENT_SECRET");
  const googleReady = Boolean(clientId && clientSecret && (isDevelopment || origin));
  const baseURL = origin ?? new URL(request.url).origin;

  return {
    ...defaults,
    baseURL,
    trustedOrigins: origin ? [origin] : defaults.trustedOrigins,
    emailAndPassword: { enabled: false },
    socialProviders: googleReady
      ? {
          google: {
            clientId: clientId!,
            clientSecret: clientSecret!,
            prompt: "select_account",
            // Only the redirect flow with state and PKCE. No client-supplied ID tokens.
            disableIdTokenSignIn: true,
            requireEmailVerification: true,
            // Copy Google's current email and name to the user on each sign-in, so
            // the identity never shows an address that Google no longer reports.
            overrideUserInfoOnSignIn: true,
          },
        }
      : {},
    account: {
      accountLinking: { enabled: false, disableImplicitLinking: true },
      encryptOAuthTokens: true,
    },
    user: {
      // Runs before a user row is created and on each later Google sign-in, with
      // the claims from that sign-in.
      validateUserInfo: async ({ user, source }, ctx) => {
        if (source.method !== "oauth" || source.oauth?.providerId !== GOOGLE) {
          return { error: "provider_not_allowed" };
        }
        if (user.emailVerified !== true) return { error: "email_not_verified" };
        // A returning user whose new Google email belongs to another user cannot
        // sign in. Otherwise the email update fails and the old email stays.
        if (source.action === "sign-in" && user.email) {
          const owner = await ctx.context.internalAdapter.findUserByEmail(user.email.toLowerCase());
          if (owner && owner.user.id !== user.id) return { error: "email_in_use" };
        }
      },
    },
    session: {
      // A fixed 12-hour session. A new sign-in, which refreshes the Google email,
      // is required at least that often.
      expiresIn: 60 * 60 * 12,
      disableSessionRefresh: true,
      // Every request reads the session row, so sign-out and revocation apply at once.
      cookieCache: { enabled: false },
    },
    disabledPaths: DISABLED_PATHS,
    onAPIError: { errorURL: `${baseURL}/sign-in` },
  };
});
