import { Router, type IRouter } from "express";
import healthRouter from "./health";
import farmRouter from "./farm";
import authRouter from "./auth";
import farmerRouter from "./farmer";
import marketplaceRouter from "./marketplace";
import orderRouter from "./orders";
import callRouter from "./calls";
import messageRouter from "./messages";
import profileRouter from "./profile";
import marketRouter from "./market";
import driverRouter from "./driver";
import paymentRouter from "./payments";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(farmRouter);
router.use(authRouter);
router.use(farmerRouter);
router.use(marketplaceRouter);
router.use(orderRouter);
router.use(callRouter);
router.use(messageRouter);
router.use(profileRouter);
router.use(marketRouter);
router.use(driverRouter);
router.use(paymentRouter);
router.use(adminRouter);

export default router;
