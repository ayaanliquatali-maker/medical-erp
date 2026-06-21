import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { purchaseReturnsTable } from "./purchase_returns";
import { productsTable } from "./products";

export const purchaseReturnLinesTable = pgTable("purchase_return_lines", {
  id: serial("id").primaryKey(),
  purchaseReturnId: integer("purchase_return_id").notNull().references(() => purchaseReturnsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  unitType: text("unit_type").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 4 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 4 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PurchaseReturnLine = typeof purchaseReturnLinesTable.$inferSelect;
