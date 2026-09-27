CREATE TABLE `audit_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`invoice_count` integer NOT NULL,
	`invoiced_total_cents` integer NOT NULL,
	`recoverable_total_cents` integer NOT NULL,
	`finding_count` integer NOT NULL,
	CONSTRAINT "audit_runs_invoiced_total_check" CHECK("audit_runs"."invoiced_total_cents" >= 0),
	CONSTRAINT "audit_runs_recoverable_total_check" CHECK("audit_runs"."recoverable_total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE `contract_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_id` integer NOT NULL,
	`sku` text NOT NULL,
	`description` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`clause` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "contract_prices_unit_price_check" CHECK("contract_prices"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contract_prices_contract_sku_unique` ON `contract_prices` (`contract_id`,`sku`);--> statement-breakpoint
CREATE TABLE `contract_surcharges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_id` integer NOT NULL,
	`surcharge_type` text NOT NULL,
	`cap_bps` integer,
	`clause` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "contract_surcharges_cap_check" CHECK("contract_surcharges"."cap_bps" IS NULL OR "contract_surcharges"."cap_bps" >= 0),
	CONSTRAINT "contract_surcharges_type_check" CHECK("contract_surcharges"."surcharge_type" IN ('fuel', 'energy', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contract_surcharges_contract_type_unique` ON `contract_surcharges` (`contract_id`,`surcharge_type`);--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`contract_number` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`currency` text NOT NULL,
	`freight_terms` text NOT NULL,
	`freight_clause` text,
	`surcharge_clause` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contracts_term_check" CHECK("contracts"."start_date" <= "contracts"."end_date"),
	CONSTRAINT "contracts_currency_check" CHECK("contracts"."currency" = 'USD'),
	CONSTRAINT "contracts_freight_terms_check" CHECK("contracts"."freight_terms" IN ('included', 'billable', 'not_stated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contracts_document_id_unique` ON `contracts` (`document_id`);--> statement-breakpoint
CREATE INDEX `contracts_supplier_start_idx` ON `contracts` (`supplier_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `decisions` (
	`finding_key` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`amount_cents` integer NOT NULL,
	`decided_at` integer NOT NULL,
	CONSTRAINT "decisions_status_check" CHECK("decisions"."status" IN ('approved', 'rejected')),
	CONSTRAINT "decisions_reason_check" CHECK("decisions"."status" = 'approved' OR ("decisions"."reason" IS NOT NULL AND length(trim("decisions"."reason")) > 0)),
	CONSTRAINT "decisions_amount_check" CHECK("decisions"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sha256` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`source` text NOT NULL,
	`kind` text,
	`status` text NOT NULL,
	`error` text,
	`has_text_layer` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "documents_size_bytes_check" CHECK("documents"."size_bytes" >= 0),
	CONSTRAINT "documents_source_check" CHECK("documents"."source" IN ('upload', 'webhook', 'sample')),
	CONSTRAINT "documents_kind_check" CHECK("documents"."kind" IS NULL OR "documents"."kind" IN ('invoice', 'contract', 'purchase_order', 'receipts_csv', 'payments_csv')),
	CONSTRAINT "documents_status_check" CHECK("documents"."status" IN ('queued', 'extracting', 'done', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_sha256_unique` ON `documents` (`sha256`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`finding_key` text NOT NULL,
	`check_id` text NOT NULL,
	`action` text NOT NULL,
	`invoice_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`title` text NOT NULL,
	`calculation` text NOT NULL,
	`evidence` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `audit_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "findings_check_id_check" CHECK("findings"."check_id" IN ('contract_price', 'duplicate', 'quantity_received', 'surcharge', 'freight', 'missing_reference')),
	CONSTRAINT "findings_action_check" CHECK("findings"."action" IN ('recover', 'block_payment', 'review_only')),
	CONSTRAINT "findings_amount_check" CHECK("findings"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `findings_finding_key_unique` ON `findings` (`finding_key`);--> statement-breakpoint
CREATE TABLE `invoice_charges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`line_no` integer NOT NULL,
	`kind` text NOT NULL,
	`surcharge_type` text,
	`label` text NOT NULL,
	`rate_bps` integer,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invoice_charges_kind_check" CHECK("invoice_charges"."kind" IN ('surcharge', 'freight', 'other')),
	CONSTRAINT "invoice_charges_surcharge_type_check" CHECK(("invoice_charges"."kind" = 'surcharge') = ("invoice_charges"."surcharge_type" IS NOT NULL)),
	CONSTRAINT "invoice_charges_rate_check" CHECK("invoice_charges"."rate_bps" IS NULL OR "invoice_charges"."rate_bps" >= 0),
	CONSTRAINT "invoice_charges_amount_check" CHECK("invoice_charges"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_charges_invoice_line_unique` ON `invoice_charges` (`invoice_id`,`line_no`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`line_no` integer NOT NULL,
	`sku` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invoice_lines_quantity_check" CHECK("invoice_lines"."quantity" > 0),
	CONSTRAINT "invoice_lines_unit_price_check" CHECK("invoice_lines"."unit_price_cents" >= 0),
	CONSTRAINT "invoice_lines_amount_check" CHECK("invoice_lines"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_lines_invoice_line_unique` ON `invoice_lines` (`invoice_id`,`line_no`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`invoice_number` text NOT NULL,
	`invoice_date` text NOT NULL,
	`po_number` text,
	`currency` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoices_currency_check" CHECK("invoices"."currency" = 'USD'),
	CONSTRAINT "invoices_subtotal_check" CHECK("invoices"."subtotal_cents" >= 0),
	CONSTRAINT "invoices_total_check" CHECK("invoices"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_document_id_unique` ON `invoices` (`document_id`);--> statement-breakpoint
CREATE INDEX `invoices_invoice_number_idx` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `invoices_po_number_idx` ON `invoices` (`po_number`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`row_no` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`invoice_number` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_date` text NOT NULL,
	`reference` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_amount_check" CHECK("payments"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_document_row_unique` ON `payments` (`document_id`,`row_no`);--> statement-breakpoint
CREATE INDEX `payments_invoice_number_idx` ON `payments` (`invoice_number`);--> statement-breakpoint
CREATE TABLE `po_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`po_id` integer NOT NULL,
	`line_no` integer NOT NULL,
	`sku` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer,
	FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "po_lines_quantity_check" CHECK("po_lines"."quantity" > 0),
	CONSTRAINT "po_lines_unit_price_check" CHECK("po_lines"."unit_price_cents" IS NULL OR "po_lines"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `po_lines_po_line_unique` ON `po_lines` (`po_id`,`line_no`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`po_number` text NOT NULL,
	`order_date` text NOT NULL,
	`currency` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_orders_currency_check" CHECK("purchase_orders"."currency" = 'USD')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_document_id_unique` ON `purchase_orders` (`document_id`);--> statement-breakpoint
CREATE INDEX `purchase_orders_po_number_idx` ON `purchase_orders` (`po_number`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`row_no` integer NOT NULL,
	`po_number` text NOT NULL,
	`sku` text NOT NULL,
	`quantity_received` integer NOT NULL,
	`received_date` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "receipts_quantity_check" CHECK("receipts"."quantity_received" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_document_row_unique` ON `receipts` (`document_id`,`row_no`);--> statement-breakpoint
CREATE INDEX `receipts_po_sku_idx` ON `receipts` (`po_number`,`sku`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_key_unique` ON `suppliers` (`key`);