import { Router, type IRouter } from "express";
import healthRouter from "./health";
import farmRouter from "./farm";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(farmRouter);
router.use(authRouter);

export default router;
