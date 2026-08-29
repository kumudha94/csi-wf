import { Router } from "express";
import { insertEventSchema } from "@shared/schema";
import * as eventsStorage from "../storage/events";
import { wrap } from "../lib/asyncHandler";
import { parseId } from "../lib/parseId";

export const eventsRouter = Router();

eventsRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await eventsStorage.listEvents();
    res.json(list);
  })
);

eventsRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const event = await eventsStorage.getEvent(id);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  })
);

eventsRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertEventSchema.parse(req.body);
    const event = await eventsStorage.createEvent(data);
    res.status(201).json(event);
  })
);

eventsRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertEventSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const event = await eventsStorage.updateEvent(id, data);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  })
);

eventsRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await eventsStorage.deleteEvent(id);
    if (!deleted) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.status(204).send();
  })
);
