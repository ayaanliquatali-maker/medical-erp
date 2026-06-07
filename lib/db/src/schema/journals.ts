import { pgTable, serial, text, numeric, date, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";

export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  reference: text("reference"),
  type: text("type").notNull().default("manual"), // 'manual' | 'sale' | 'purchase' | 'expense' | 'adjustment'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalLinesTable = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull().references(() => journalEntriesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  debit: numeric("debit", { precision: 15, scale: 4 }).notNull().default("0"),
  credit: numeric("credit", { precision: 15, scale: 4 }).notNull().default("0"),
  description: text("description"),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntriesTable).omit({ id: true, createdAt: true });
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;

export const insertJournalLineSchema = createInsertSchema(journalLinesTable).omit({ id: true });
export type InsertJournalLine = z.infer<typeof insertJournalLineSchema>;
export type JournalLine = typeof journalLinesTable.$inferSelect;
