import { useState } from "react";
import type { InferProps } from "void";
import { auth } from "void/client";
import type { loader } from "./sign-in.server";

export default function SignIn({ signedIn, error }: InferProps<typeof loader>) {
  const [message, setMessage] = useState(error);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    setMessage(null);
    const result = await auth.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/sign-in",
    });
    // On success, the client goes to Google. An error means sign-in is not possible.
    if (result.error) {
      setPending(false);
      setMessage(
        result.error.status === 404
          ? "Google sign-in is not configured on this server."
          : "Sign-in failed. Try again.",
      );
    }
  }

  return (
    <main>
      <h1>Kawal Asap · App</h1>
      <p>Sign in with Google. A sign-in does not give app access. A reviewer must approve it.</p>
      {message ? <p role="alert">{message}</p> : null}
      {signedIn ? (
        <p>
          You are signed in. <a href="/">Continue</a> or <a href="/sign-out">sign out</a>.
        </p>
      ) : (
        <button type="button" onClick={signIn} disabled={pending}>
          Sign in with Google
        </button>
      )}
    </main>
  );
}
