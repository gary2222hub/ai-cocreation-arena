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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participant_seats_recovery_token_unique` ON `participant_seats` (`recovery_token`);--> statement-breakpoint
ALTER TABLE `activities` ADD `room_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `activities`
SET `room_code` = upper(substr(replace(`id`, '-', ''), 1, 6))
WHERE `room_code` = '';--> statement-breakpoint
ALTER TABLE `activities` ADD `roster_locked_at` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `locked_seat_limit` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `review_started_at` text;
