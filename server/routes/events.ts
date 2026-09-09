import { Router } from "express";
import { z } from "zod";
import { insertEventSchema, updateEventSchema, EVENT_FUND_TARGETS } from "@shared/schema";
import * as eventsStorage from "../storage/events";
import * as expensesStorage from "../storage/expenses";
import { wrap } from "../lib/asyncHandler";
import { parseId } from "../lib/parseId";
import { fromMoney } from "../lib/money";
import { generateEventReportPdf } from "../lib/pdf";

export const eventsRouter = Router();

const fundActionSchema = z.object({ target: z.enum(EVENT_FUND_TARGETS) });

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

eventsRouter.get(
  "/:id/pdf",
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
    // Credit (Offering/Donation) rows aren't expenses -- keep them out of
    // this ledger's paid/pending expense totals and rows.
    const debitRows = (await expensesStorage.listExpenses(id)).filter((e) => e.txnType === "debit");
    const totalPaid = debitRows.filter((e) => e.status === "paid").reduce((sum, e) => sum + fromMoney(e.amount), 0);
    const totalPending = debitRows
      .filter((e) => e.status === "pending")
      .reduce((sum, e) => sum + fromMoney(e.amount), 0);
    const pdfBuffer = await generateEventReportPdf({
      name: event.name,
      details: event.details,
      totalPaid,
      totalPending,
      expenses: debitRows,
    });
    const safeName = event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="csi-wf-${safeName}.pdf"`);
    res.send(pdfBuffer);
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
    const data = updateEventSchema.parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const current = await eventsStorage.getEvent(id);
    if (!current) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (data.hasEventFund !== undefined && data.hasEventFund !== current.hasEventFund && current.hasExpenses) {
      res.status(400).json({ error: "Cannot change the event fund setting once expenses exist" });
      return;
    }
    const effectiveHasEventFund = data.hasEventFund ?? current.hasEventFund;
    const effectiveEventDate = data.eventDate !== undefined ? data.eventDate : current.eventDate;
    if (effectiveHasEventFund && !effectiveEventDate) {
      res.status(400).json({ error: "Event date is required when tracking a separate event fund" });
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

eventsRouter.post(
  "/:id/transfer",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { target } = fundActionSchema.parse(req.body);
    try {
      const event = await eventsStorage.transferEventFundSurplus(id, target);
      res.json(event);
    } catch (error) {
      if (error instanceof eventsStorage.EventFundActionError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

eventsRouter.post(
  "/:id/cover-shortfall",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { target: source } = fundActionSchema.parse(req.body);
    try {
      const event = await eventsStorage.coverEventFundShortfall(id, source);
      res.json(event);
    } catch (error) {
      if (error instanceof eventsStorage.EventFundActionError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
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
