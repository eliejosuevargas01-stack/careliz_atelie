import cors from "cors";
import express from "express";

import { errorHandler } from "./middleware/error-handler";
import { blocksRouter } from "./routes/blocks";
import { calendarRouter } from "./routes/calendar";
import { catalogRouter } from "./routes/catalog";
import { clientsRouter } from "./routes/clients";
import { eventsRouter } from "./routes/events";
import { healthRouter } from "./routes/health";
import { interactionsRouter } from "./routes/interactions";
import { productionRouter } from "./routes/production";
import { sessionsRouter } from "./routes/sessions";
import { setupRouter } from "./routes/setup";

export const app = express();

app.use(
  cors({
    origin: true,
  }),
);
app.use(express.json());

app.use(healthRouter);
app.use("/api", setupRouter);
app.use("/api", sessionsRouter);
app.use("/api", catalogRouter);
app.use("/api", clientsRouter);
app.use("/api", calendarRouter);
app.use("/api", eventsRouter);
app.use("/api", blocksRouter);
app.use("/api", productionRouter);
app.use("/api", interactionsRouter);

app.use(errorHandler);
