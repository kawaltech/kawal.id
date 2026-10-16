CREATE TABLE `reviewer_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_user_id` text,
	`invitation_id` text,
	`detail` text,
	CONSTRAINT "reviewer_audit_events_action" CHECK("reviewer_audit_events"."action" IN ('invitation.create', 'invitation.revoke', 'invitation.claim', 'grant.revoke'))
);
--> statement-breakpoint
CREATE INDEX `reviewer_audit_events_occurred_at` ON `reviewer_audit_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `reviewer_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`google_subject` text NOT NULL,
	`role` text NOT NULL,
	`invitation_id` text NOT NULL,
	`granted_at` text NOT NULL,
	`revoked_at` text,
	`revoked_by_user_id` text,
	`revocation_reason` text,
	CONSTRAINT "reviewer_grants_role" CHECK("reviewer_grants"."role" IN ('reviewer', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_grants_active_user_id` ON `reviewer_grants` (`user_id`) WHERE "reviewer_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_grants_active_google_subject` ON `reviewer_grants` (`google_subject`) WHERE "reviewer_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_grants_invitation_id` ON `reviewer_grants` (`invitation_id`);--> statement-breakpoint
CREATE INDEX `reviewer_grants_user_id` ON `reviewer_grants` (`user_id`);--> statement-breakpoint
CREATE TABLE `reviewer_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_via` text NOT NULL,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`claimed_at` text,
	`claimed_by_user_id` text,
	`claimed_google_subject` text,
	`revoked_at` text,
	`revoked_by_user_id` text,
	CONSTRAINT "reviewer_invitations_role" CHECK("reviewer_invitations"."role" IN ('reviewer', 'admin')),
	CONSTRAINT "reviewer_invitations_created_via" CHECK("reviewer_invitations"."created_via" IN ('admin', 'bootstrap', 'local')),
	CONSTRAINT "reviewer_invitations_claim" CHECK(("reviewer_invitations"."claimed_at" IS NULL) = ("reviewer_invitations"."claimed_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_invitations_open_email` ON `reviewer_invitations` (`email`) WHERE "reviewer_invitations"."claimed_at" IS NULL AND "reviewer_invitations"."revoked_at" IS NULL;