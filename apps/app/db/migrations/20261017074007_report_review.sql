CREATE TABLE `report_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_grant_id` text NOT NULL,
	`action` text NOT NULL,
	`report_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	CONSTRAINT "report_audit_events_action" CHECK("report_audit_events"."action" IN ('report.create', 'report.submit', 'report.discard', 'review.approve', 'review.request_changes', 'review.reject'))
);
--> statement-breakpoint
CREATE INDEX `report_audit_events_report_id` ON `report_audit_events` (`report_id`);--> statement-breakpoint
CREATE INDEX `report_audit_events_occurred_at` ON `report_audit_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `report_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`reviewer_grant_id` text NOT NULL,
	`decision` text NOT NULL,
	`note` text,
	`decided_at` text NOT NULL,
	CONSTRAINT "report_reviews_decision" CHECK("report_reviews"."decision" IN ('approve', 'request_changes', 'reject')),
	CONSTRAINT "report_reviews_note" CHECK("report_reviews"."decision" = 'approve' OR ("report_reviews"."note" IS NOT NULL AND length("report_reviews"."note") > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_reviews_revision_id` ON `report_reviews` (`revision_id`);--> statement-breakpoint
CREATE INDEX `report_reviews_report_id` ON `report_reviews` (`report_id`);--> statement-breakpoint
CREATE TABLE `report_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`account` text,
	`observed_at` text,
	`province` text,
	`area` text,
	`source_channel` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`submitted_at` text,
	CONSTRAINT "report_revisions_source_channel" CHECK("report_revisions"."source_channel" IS NULL OR "report_revisions"."source_channel" IN ('in_person', 'phone', 'messaging', 'other')),
	CONSTRAINT "report_revisions_complete" CHECK("report_revisions"."submitted_at" IS NULL OR ("report_revisions"."account" IS NOT NULL AND "report_revisions"."observed_at" IS NOT NULL AND "report_revisions"."province" IS NOT NULL AND "report_revisions"."area" IS NOT NULL AND "report_revisions"."source_channel" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_revisions_number` ON `report_revisions` (`report_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_revisions_open` ON `report_revisions` (`report_id`) WHERE "report_revisions"."submitted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`author_user_id` text NOT NULL,
	`current_revision_id` text NOT NULL,
	`version` integer NOT NULL,
	`last_change_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "reports_state" CHECK("reports"."state" IN ('draft', 'in_review', 'approved', 'rejected', 'discarded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_last_change_id` ON `reports` (`last_change_id`);--> statement-breakpoint
CREATE INDEX `reports_author_user_id` ON `reports` (`author_user_id`);--> statement-breakpoint
CREATE INDEX `reports_updated_at` ON `reports` (`updated_at`);--> statement-breakpoint
-- Added by hand: submitted revisions, reviews, and audit events do not change.
CREATE TRIGGER `report_revisions_frozen_update` BEFORE UPDATE ON `report_revisions`
WHEN OLD.`submitted_at` IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'report_revisions: a submitted revision does not change'); END;--> statement-breakpoint
CREATE TRIGGER `report_revisions_frozen_delete` BEFORE DELETE ON `report_revisions`
WHEN OLD.`submitted_at` IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'report_revisions: a submitted revision does not change'); END;--> statement-breakpoint
CREATE TRIGGER `report_reviews_no_update` BEFORE UPDATE ON `report_reviews`
BEGIN SELECT RAISE(ABORT, 'report_reviews: append-only'); END;--> statement-breakpoint
CREATE TRIGGER `report_reviews_no_delete` BEFORE DELETE ON `report_reviews`
BEGIN SELECT RAISE(ABORT, 'report_reviews: append-only'); END;--> statement-breakpoint
CREATE TRIGGER `report_audit_events_no_update` BEFORE UPDATE ON `report_audit_events`
BEGIN SELECT RAISE(ABORT, 'report_audit_events: append-only'); END;--> statement-breakpoint
CREATE TRIGGER `report_audit_events_no_delete` BEFORE DELETE ON `report_audit_events`
BEGIN SELECT RAISE(ABORT, 'report_audit_events: append-only'); END;
