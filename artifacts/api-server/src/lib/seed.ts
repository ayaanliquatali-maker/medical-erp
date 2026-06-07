import { db } from "@workspace/db";
import { accountsTable, receiptSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_ACCOUNTS = [
  // Assets
  { code: "1000", name: "Cash", type: "asset", isSystem: true, parentId: null, description: "Cash on hand" },
  { code: "1100", name: "Bank Account", type: "asset", isSystem: true, parentId: null, description: "Bank checking account" },
  { code: "1200", name: "Accounts Receivable", type: "asset", isSystem: true, parentId: null, description: "Amounts owed by customers" },
  { code: "1300", name: "Inventory", type: "asset", isSystem: true, parentId: null, description: "Medicines and products in stock" },
  { code: "1400", name: "Prepaid Expenses", type: "asset", isSystem: false, parentId: null, description: "Expenses paid in advance" },
  // Liabilities
  { code: "2000", name: "Accounts Payable", type: "liability", isSystem: true, parentId: null, description: "Amounts owed to vendors" },
  { code: "2100", name: "Loans Payable", type: "liability", isSystem: false, parentId: null, description: "Bank and other loans" },
  { code: "2200", name: "Accrued Liabilities", type: "liability", isSystem: false, parentId: null, description: "Accrued but unpaid expenses" },
  // Equity
  { code: "3000", name: "Owner Equity", type: "equity", isSystem: true, parentId: null, description: "Owner's investment in the business" },
  { code: "3100", name: "Retained Earnings", type: "equity", isSystem: true, parentId: null, description: "Accumulated profits" },
  // Revenue
  { code: "4000", name: "Sales Revenue", type: "revenue", isSystem: true, parentId: null, description: "Revenue from medicine sales" },
  { code: "4100", name: "Other Revenue", type: "revenue", isSystem: false, parentId: null, description: "Miscellaneous revenue" },
  // Expenses
  { code: "5000", name: "Cost of Goods Sold", type: "expense", isSystem: true, parentId: null, description: "Cost of medicines sold" },
  { code: "5100", name: "Rent Expense", type: "expense", isSystem: false, parentId: null, description: "Shop rent" },
  { code: "5200", name: "Salary Expense", type: "expense", isSystem: false, parentId: null, description: "Employee salaries" },
  { code: "5300", name: "Utilities Expense", type: "expense", isSystem: false, parentId: null, description: "Electricity, water, internet" },
  { code: "5400", name: "Marketing Expense", type: "expense", isSystem: false, parentId: null, description: "Advertising and promotions" },
  { code: "5500", name: "General & Admin Expense", type: "expense", isSystem: false, parentId: null, description: "General business expenses" },
];

export async function seedDatabase() {
  try {
    // Check if accounts already seeded
    const existingAccounts = await db.select().from(accountsTable);
    if (existingAccounts.length === 0) {
      logger.info("Seeding default chart of accounts...");
      for (const account of DEFAULT_ACCOUNTS) {
        await db.insert(accountsTable).values({
          code: account.code,
          name: account.name,
          type: account.type,
          isSystem: account.isSystem,
          isActive: true,
          description: account.description,
        });
      }
      logger.info("Chart of accounts seeded successfully");
    }

    // Seed receipt settings if not exists
    const existingSettings = await db.select().from(receiptSettingsTable);
    if (existingSettings.length === 0) {
      await db.insert(receiptSettingsTable).values({
        storeName: "My Medical Store",
        storeAddress: "123 Medical Street, City",
        storePhone: "+92-300-0000000",
        footerText: "Thank you for your business. Get well soon!",
        showLogo: true,
        showAddress: true,
        showPhone: true,
        showEmail: false,
        showTaxInfo: false,
      });
      logger.info("Receipt settings seeded");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed database");
  }
}
