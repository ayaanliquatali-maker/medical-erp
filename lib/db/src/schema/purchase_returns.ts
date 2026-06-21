import { pgTable, serial, text, numeric, date, integer, timestamp } from "drizzle-orm/pg-core";
import { inventoryBatchesTable } from "./inventory";
import { vendorsTable } from "./vendors";
import { accountsTable } from "./accounts";
import { journalEntriesTable } from "./journals";

export const purchaseReturnsTable = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  returnNumber: text("return_number").notNull().unique(),
  date: date("date", { mode: "string" }).notNull(),
  originalBatchId: integer("original_batch_id").notNull().references(() => inventoryBatchesTable.id),
  vendorId: integer("vendor_id").references(() => vendorsTable.id),
  subtotal: numeric("subtotal", { precision: 15, scale: 4 }).notNull(),
  total: numeric("total", { precision: 15, scale: 4 }).notNull(),
  paymentAccountId: integer("payment_account_id").notNull().references(() => accountsTable.id),
  journalEntryId: integer("journal_entry_id").references(() => journalEntriesTable.id),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PurchaseReturn = typeof purchaseReturnsTable.$inferSelect;
