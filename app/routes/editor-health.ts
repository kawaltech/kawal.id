export function loader() {
  return Response.json(
    { status: "ok", service: "editorial" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
