# Historical migrations

`0001-users.sql` belongs to the superseded local SQLite foundation in ADR 0001.
Keep the file unchanged. It is not applied by setup or the native Void editorial
target. There are no real records to migrate.

Future D1 product migrations belong to `apps/editorial/migrations/` and must
support overlapping application versions. Do not copy the old schema without a
review of native Void authentication and D1 requirements. No product schema,
sign-in, or reviewer permission system is implemented yet.
