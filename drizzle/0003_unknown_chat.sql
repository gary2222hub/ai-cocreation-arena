CREATE TABLE `__backup_capabilities` AS
SELECT `token`, `activity_id`, `purpose` FROM `capabilities`;--> statement-breakpoint
CREATE TABLE `__backup_participant_seats` AS
SELECT `id`, `activity_id`, `nickname`, `nickname_normalized`, `agent_name`,
       `agent_name_normalized`, `recovery_token`, `joined_at`, `last_seen_at`
FROM `participant_seats`;--> statement-breakpoint
DROP TABLE `participant_seats`;--> statement-breakpoint
DROP TABLE `capabilities`;--> statement-breakpoint
CREATE TABLE `__new_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`invitation_code` text NOT NULL,
	`template` text NOT NULL,
	`name` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`participant_limit` integer NOT NULL,
	`rounds_json` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`roster_locked_at` text,
	`locked_seat_limit` integer,
	`review_started_at` text,
	FOREIGN KEY (`invitation_code`) REFERENCES `invitations`(`code`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_activities`("id", "room_code", "invitation_code", "template", "name", "starts_at", "ends_at", "participant_limit", "rounds_json", "status", "created_at", "roster_locked_at", "locked_seat_limit", "review_started_at")
SELECT "id", "room_code", "invitation_code", "template", "name", "starts_at", "ends_at", "participant_limit", "rounds_json", "status", "created_at", "roster_locked_at", "locked_seat_limit", "review_started_at" FROM `activities`;--> statement-breakpoint
DROP TABLE `activities`;--> statement-breakpoint
ALTER TABLE `__new_activities` RENAME TO `activities`;--> statement-breakpoint
CREATE UNIQUE INDEX `activities_invitation_code_unique` ON `activities` (`invitation_code`);--> statement-breakpoint
CREATE TABLE `capabilities` (
	`token` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`purpose` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `capabilities` (`token`, `activity_id`, `purpose`)
SELECT `token`, `activity_id`, `purpose` FROM `__backup_capabilities`;--> statement-breakpoint
CREATE TABLE `participant_seats` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`nickname` text NOT NULL,
	`nickname_normalized` text NOT NULL,
	`agent_name` text NOT NULL,
	`agent_name_normalized` text NOT NULL,
	`recovery_token` text NOT NULL,
	`joined_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `participant_seats_recovery_token_unique` ON `participant_seats` (`recovery_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `participant_seats_activity_nickname_unique` ON `participant_seats` (`activity_id`,`nickname_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `participant_seats_activity_agent_unique` ON `participant_seats` (`activity_id`,`agent_name_normalized`);--> statement-breakpoint
INSERT INTO `participant_seats` (`id`, `activity_id`, `nickname`, `nickname_normalized`, `agent_name`, `agent_name_normalized`, `recovery_token`, `joined_at`, `last_seen_at`)
SELECT `id`, `activity_id`, `nickname`, `nickname_normalized`, `agent_name`, `agent_name_normalized`, `recovery_token`, `joined_at`, `last_seen_at`
FROM `__backup_participant_seats`;--> statement-breakpoint
DROP TABLE `__backup_capabilities`;--> statement-breakpoint
DROP TABLE `__backup_participant_seats`;
