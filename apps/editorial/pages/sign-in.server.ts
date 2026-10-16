import { defineHandler } from "void";
import { getUser } from "void/auth";

// Better Auth sends errors back as ?error=<code>. Show only known messages.
const MESSAGES: Record<string, string> = {
  email_not_verified: "Google did not confirm this email address. Sign-in is not possible.",
  account_not_linked: "This email address is already used by a different Google account.",
  email_in_use: "Another account already uses this email address. Ask an administrator.",
  provider_not_allowed: "Only Google sign-in is available.",
};

export const loader = defineHandler((c) => {
  const code = c.req.query("error");
  return {
    signedIn: getUser() !== null,
    error: code ? (MESSAGES[code] ?? "Sign-in failed. Try again.") : null,
  };
});
