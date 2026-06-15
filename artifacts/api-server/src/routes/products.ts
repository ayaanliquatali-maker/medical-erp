import { Router } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { serializeForZod } from "../lib/serialize";
import { requireAdmin, isAdminRequest } from "../lib/admin";
import { logAudit } from "../lib/audit";
import {
  productsTable,
  inventoryBatchesTable,
  saleLinesTable,
} from "@workspace/db";
import {
  ListProductsResponse,
  CreateProductBody,
  GetProductParams,
  GetProductResponse,
  UpdateProductParams,
  UpdateProductBody,
  UpdateProductResponse,
  DeleteProductParams,
  DeleteProductResponse,
  ClearProductStockParams,
  ClearProductStockResponse,
  ListProductsQueryParams,
} from "@workspace/api-zod";

const router = Router();

async function getProductWithStock(productId: number) {
  const product = await db.query.productsTable.findFirst({
    where: and(eq(productsTable.id, productId), isNull(productsTable.deletedAt)),
  });
  if (!product) return null;

  const batches = await db
    .select()
    .from(inventoryBatchesTable)
    .where(eq(inventoryBatchesTable.productId, productId));

  const totalTablets = batches.reduce((sum, b) => sum + b.remainingTablets, 0);

  const activeBatches = batches
    .filter(b => b.remainingTablets > 0 && new Date(b.expiryDate) > new Date())
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

  const nearestExpiry = activeBatches.length > 0 ? activeBatches[0].expiryDate : null;

  // Selling prices come from the current FIFO batch (earliest expiry with stock)
  const fifoBatch = activeBatches[0];
  const sellingPricePerUnit = fifoBatch ? parseFloat(fifoBatch.sellingPricePerUnit as string) : 0;
  const sellingPricePerPack = fifoBatch ? parseFloat(fifoBatch.sellingPricePerPack as string) : 0;
  const sellingPricePerBox = fifoBatch ? parseFloat(fifoBatch.sellingPricePerBox as string) : 0;

  // Use batch unit types for pack/box calculations
  const fifoTabsPerPack = fifoBatch ? fifoBatch.tabsPerPack : 1;
  const fifoPacksPerBox = fifoBatch ? fifoBatch.packsPerBox : 1;
  const totalPacks = totalTablets / fifoTabsPerPack;
  const totalBoxes = totalPacks / fifoPacksPerBox;
  const unitType = fifoBatch ? fifoBatch.unitType : (batches[0]?.unitType ?? "tablet");

  return {
    ...product,
    sellingPricePerUnit,
    sellingPricePerPack,
    sellingPricePerBox,
    totalTablets,
    totalPacks,
    totalBoxes,
    nearestExpiry,
    unitType,
    tabsPerPack: fifoTabsPerPack,
    packsPerBox: fifoPacksPerBox,
  };
}

router.get("/products", async (req, res): Promise<void> => {
  const qp = ListProductsQueryParams.safeParse(req.query);
  const params = qp.success ? qp.data : {};

  let products = await db.select().from(productsTable).where(isNull(productsTable.deletedAt));

  if (params.isActive !== undefined) {
    products = products.filter(p => p.isActive === params.isActive);
  }

  if (params.search) {
    const s = params.search.toLowerCase();
    products = products.filter(p =>
      p.name.toLowerCase().includes(s) ||
      (p.genericName && p.genericName.toLowerCase().includes(s)) ||
      (p.category && p.category.toLowerCase().includes(s))
    );
  }

  const enriched = await Promise.all(products.map(p => getProductWithStock(p.id)));
  const valid = enriched.filter(Boolean);

  let result = valid as Exclude<typeof valid[0], null>[];

  if (params.lowStock) {
    result = result.filter(p => p.totalTablets <= p.reorderLevel);
  }
  if (params.nearExpiry) {
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    result = result.filter(p => p.nearestExpiry && new Date(p.nearestExpiry) <= thirtyDays);
  }

  res.json(ListProductsResponse.parse(serializeForZod(result)));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db.insert(productsTable).values(parsed.data as any).returning();
  const enriched = await getProductWithStock(product.id);
  res.status(201).json(GetProductResponse.parse(serializeForZod(enriched)));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const product = await getProductWithStock(id);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(GetProductResponse.parse(serializeForZod(product)));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.isActive !== undefined && !isAdminRequest(req)) {
    res.status(401).json({ error: "Admin credentials required to change product status" });
    return;
  }

  const [updated] = await db.update(productsTable)
    .set({ ...parsed.data as any, updatedAt: new Date() })
    .where(eq(productsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Product not found" }); return; }
  const enriched = await getProductWithStock(id);
  res.json(UpdateProductResponse.parse(serializeForZod(enriched)));
});

router.delete("/products/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const product = await getProductWithStock(id);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  await db.delete(inventoryBatchesTable).where(eq(inventoryBatchesTable.productId, id));
  await db.delete(saleLinesTable).where(eq(saleLinesTable.productId, id));

  await db.delete(productsTable).where(eq(productsTable.id, id));

  await logAudit("product.delete", "product", id, { action: "delete product" }, "admin");
  res.status(204).send();
});

router.post("/products/:id/clear-stock", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(inventoryBatchesTable)
    .set({ remainingTablets: 0 })
    .where(eq(inventoryBatchesTable.productId, id));

  await logAudit("product.clearStock", "product", id, { action: "clear stock" }, "admin");
  const enriched = await getProductWithStock(id);
  if (!enriched) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(ClearProductStockResponse.parse(serializeForZod(enriched)));
});

export default router;
