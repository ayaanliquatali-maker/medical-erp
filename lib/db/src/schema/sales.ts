import { pgTable, serial, text, numeric, date, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { accountsTable } from "./accounts";
import { journalEntriesTable } from "./journals";

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  saleNumber: text("sale_number").notNull().unique(),
  date: date("date", { mode: "string" }).notNull(),
  customerName: text("customer_name"),
  subtotal: numeric("subtotal", { precision: 15, scale: 4 }).notNull(),
  discount: numeric("discount", { precision: 15, scale: 4 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 4 }).notNull(),
  paymentAccountId: integer("payment_account_id").notNull().references(() => accountsTable.id),
  journalEntryId: integer("journal_entry_id").references(() => journalEntriesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const saleLinesTable = pgTable("sale_lines", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => salesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  unitType: text("unit_type").notNull(), // 'tablet' | 'pack' | 'box'
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 4 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 4 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 4 }).notNull(),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, createdAt: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;

export const insertSaleLineSchema = createInsertSchema(saleLinesTable).omit({ id: true });
export type InsertSaleLine = z.infer<typeof insertSaleLineSchema>;
export type SaleLine = typeof saleLinesTable.$inferSelect;
