import { useState } from "react";
import { auth } from "void/client";

export default function SignOut() {
  const [failed, setFailed] = useState(false);

  async function signOut() {
    const result = await auth.signOut();
    if (result.error) setFailed(true);
    else window.location.assign("/sign-in");
  }

  return (
    <main id="isi" tabIndex={-1} lang="en">
      <section className="auth-card">
        <h1>Sign out</h1>
        <p>This ends the session on this browser.</p>
        {failed ? <p role="alert">Sign-out failed. Try again.</p> : null}
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </section>
    </main>
  );
}
