CREATE TABLE `live_ai_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`round_index` integer NOT NULL,
	`seat_id` text NOT NULL,
	`score` integer NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seat_id`) REFERENCES `participant_seats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_ai_scores_activity_round_seat_unique` ON `live_ai_scores` (`activity_id`,`round_index`,`seat_id`);--> statement-breakpoint
CREATE TABLE `live_round_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`round_index` integer NOT NULL,
	`seat_id` text NOT NULL,
	`v1` text DEFAULT '' NOT NULL,
	`improvement_prompt` text DEFAULT '' NOT NULL,
	`v2` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seat_id`) REFERENCES `participant_seats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_round_entries_activity_round_seat_unique` ON `live_round_entries` (`activity_id`,`round_index`,`seat_id`);--> statement-breakpoint
CREATE TABLE `live_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`round_index` integer NOT NULL,
	`voter_seat_id` text NOT NULL,
	`candidate_seat_id` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voter_seat_id`) REFERENCES `participant_seats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_seat_id`) REFERENCES `participant_seats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_votes_activity_round_voter_unique` ON `live_votes` (`activity_id`,`round_index`,`voter_seat_id`);--> statement-breakpoint
ALTER TABLE `activities` ADD `current_round_index` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `current_stage` text DEFAULT 'lobby' NOT NULL;