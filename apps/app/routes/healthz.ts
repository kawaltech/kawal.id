import { defineHandler } from "void";
import { db, sql } from "void/db";
import { storage } from "void/storage";

export const GET = defineHandler(async () => {
  const row = await db.get<{ ready: number }>(sql`SELECT 1 AS ready`);
  await storage.list({ limit: 1 });
  if (row?.ready !== 1) throw new Error("The database is not ready.");
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "private, no-store" } });
});
