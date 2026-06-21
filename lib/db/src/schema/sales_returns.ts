import { pgTable, serial, text, numeric, date, integer, timestamp } from "drizzle-orm/pg-core";
import { salesTable } from "./sales";
import { accountsTable } from "./accounts";
import { journalEntriesTable } from "./journals";

export const salesReturnsTable = pgTable("sales_returns", {
  id: serial("id").primaryKey(),
  returnNumber: text("return_number").notNull().unique(),
  date: date("date", { mode: "string" }).notNull(),
  originalSaleId: integer("original_sale_id").notNull().references(() => salesTable.id),
  customerName: text("customer_name"),
  subtotal: numeric("subtotal", { precision: 15, scale: 4 }).notNull(),
  total: numeric("total", { precision: 15, scale: 4 }).notNull(),
  paymentAccountId: integer("payment_account_id").notNull().references(() => accountsTable.id),
  journalEntryId: integer("journal_entry_id").references(() => journalEntriesTable.id),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SalesReturn = typeof salesReturnsTable.$inferSelect;
