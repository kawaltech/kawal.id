export default function AccessPending() {
  return (
    <main id="isi" tabIndex={-1} lang="en">
      <section className="auth-card">
        <h1>Access pending</h1>
        <p>You are signed in, but you do not have app access.</p>
        <p>A reviewer must approve your access. Ask the person who invited you.</p>
        <p>
          <a href="/sign-out">Sign out</a>
        </p>
      </section>
    </main>
  );
}
