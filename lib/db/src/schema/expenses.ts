import { pgTable, serial, text, numeric, date, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";
import { accountsTable } from "./accounts";
import { journalEntriesTable } from "./journals";

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 4 }).notNull(),
  description: text("description").notNull(),
  expenseAccountId: integer("expense_account_id").notNull().references(() => accountsTable.id),
  paymentAccountId: integer("payment_account_id").notNull().references(() => accountsTable.id),
  vendorId: integer("vendor_id").references(() => vendorsTable.id),
  journalEntryId: integer("journal_entry_id").references(() => journalEntriesTable.id),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
