import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import inventoryRouter from "./inventory";
import accountsRouter from "./accounts";
import journalsRouter from "./journals";
import vendorsRouter from "./vendors";
import expensesRouter from "./expenses";
import salesRouter from "./sales";
import receiptRouter from "./receipt";
import analyticsRouter from "./analytics";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(inventoryRouter);
router.use(accountsRouter);
router.use(journalsRouter);
router.use(vendorsRouter);
router.use(expensesRouter);
router.use(salesRouter);
router.use(receiptRouter);
router.use(analyticsRouter);
router.use(aiRouter);

export default router;
