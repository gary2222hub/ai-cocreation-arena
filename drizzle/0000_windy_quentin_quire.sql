CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_code` text NOT NULL,
	`template` text NOT NULL,
	`name` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`participant_limit` integer NOT NULL,
	`rounds_json` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invitation_code`) REFERENCES `invitations`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_invitation_code_unique` ON `activities` (`invitation_code`);--> statement-breakpoint
CREATE TABLE `capabilities` (
	`token` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`purpose` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`code` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`used_at` text
);
