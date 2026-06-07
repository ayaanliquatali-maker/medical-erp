import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const receiptSettingsTable = pgTable("receipt_settings", {
  id: serial("id").primaryKey(),
  storeName: text("store_name"),
  storeAddress: text("store_address"),
  storePhone: text("store_phone"),
  storeEmail: text("store_email"),
  logoUrl: text("logo_url"),
  footerText: text("footer_text"),
  showLogo: boolean("show_logo").notNull().default(true),
  showAddress: boolean("show_address").notNull().default(true),
  showPhone: boolean("show_phone").notNull().default(true),
  showEmail: boolean("show_email").notNull().default(false),
  showTaxInfo: boolean("show_tax_info").notNull().default(false),
  taxNumber: text("tax_number"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReceiptSettingsSchema = createInsertSchema(receiptSettingsTable).omit({ id: true });
export type InsertReceiptSettings = z.infer<typeof insertReceiptSettingsSchema>;
export type ReceiptSettings = typeof receiptSettingsTable.$inferSelect;
