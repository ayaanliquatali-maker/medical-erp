import { pgTable, serial, integer, numeric, date, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { vendorsTable } from "./vendors";
import { journalEntriesTable } from "./journals";

export const inventoryBatchesTable = pgTable("inventory_batches", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  batchNumber: text("batch_number"),
  boxesPurchased: integer("boxes_purchased").notNull(),
  packsPerBox: integer("packs_per_box").notNull(),
  tabsPerPack: integer("tabs_per_pack").notNull(),
  totalTablets: integer("total_tablets").notNull(),
  remainingTablets: integer("remaining_tablets").notNull(),
  costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 4 }).notNull(),
  sellingPricePerUnit: numeric("selling_price_per_unit", { precision: 10, scale: 4 }).notNull().default("0"),
  sellingPricePerPack: numeric("selling_price_per_pack", { precision: 10, scale: 4 }).notNull().default("0"),
  sellingPricePerBox: numeric("selling_price_per_box", { precision: 10, scale: 4 }).notNull().default("0"),
  expiryDate: date("expiry_date", { mode: "string" }).notNull(),
  vendorId: integer("vendor_id").references(() => vendorsTable.id),
  journalEntryId: integer("journal_entry_id").references(() => journalEntriesTable.id),
  notes: text("notes"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryBatchSchema = createInsertSchema(inventoryBatchesTable).omit({ id: true, createdAt: true });
export type InsertInventoryBatch = z.infer<typeof insertInventoryBatchSchema>;
export type InventoryBatch = typeof inventoryBatchesTable.$inferSelect;
