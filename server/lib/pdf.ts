import PDFDocument from "pdfkit";
import { fromMoney } from "./money";

// ---------- shared brand chrome ----------
// Matches the mobile app's own palette (mobile/src/theme.ts lightColors) so
// exported PDFs feel like the same product, not a bolted-on report tool.
const COLORS = {
  primary: "#6D28D9",
  primaryDark: "#4C1D95",
  primarySoft: "#EDE4FA",
  textPrimary: "#221D17",
  textSecondary: "#7A7168",
  textMuted: "#AFA598",
  border: "#E5DED1",
  success: "#3F8F5D",
  danger: "#C4432E",
  white: "#FFFFFF",
  headerSubtext: "#E4D9FA",
};

const PAGE_MARGIN = 40;
const HEADER_HEIGHT = 74;
const FOOTER_HEIGHT = 34;
const FRAME_X = 16;

function frameTop(): number {
  return HEADER_HEIGHT + 4 + 8;
}
function frameBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - FOOTER_HEIGHT - 8;
}

// Branded header band + title/period + a colored border framing the body
// content area. Drawn once for the first page, then again automatically on
// every page PDFKit adds (e.g. when a ledger table overflows), via the
// "pageAdded" listener each generator registers.
function drawPageChrome(doc: PDFKit.PDFDocument, title: string, period: string) {
  const pageWidth = doc.page.width;

  doc.rect(0, 0, pageWidth, HEADER_HEIGHT).fill(COLORS.primary);
  doc.rect(0, HEADER_HEIGHT, pageWidth, 4).fill(COLORS.primaryDark);

  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(17);
  doc.text("CSI Women's Fellowship", PAGE_MARGIN, 15, { width: pageWidth - PAGE_MARGIN * 2 });
  doc.font("Helvetica-Bold").fontSize(10).text(title, PAGE_MARGIN, 37, { width: pageWidth - PAGE_MARGIN * 2 });
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.headerSubtext);
  doc.text(period, PAGE_MARGIN, 53, { width: pageWidth - PAGE_MARGIN * 2 });

  doc
    .rect(FRAME_X, frameTop(), pageWidth - FRAME_X * 2, frameBottom(doc) - frameTop())
    .lineWidth(1.2)
    .strokeColor(COLORS.primary)
    .stroke();

  doc.fillColor(COLORS.textPrimary).font("Helvetica").fontSize(11);
  doc.x = PAGE_MARGIN;
  doc.y = frameTop() + 14;
}

// Registers the repeating chrome and draws it for page 1 (PDFKit's
// "pageAdded" event only fires for pages added *after* the first).
function startDocument(doc: PDFKit.PDFDocument, title: string, period: string) {
  doc.on("pageAdded", () => drawPageChrome(doc, title, period));
  drawPageChrome(doc, title, period);
}

// Applies "Page X of Y" + a footer band to every page, using PDFKit's
// buffered-page API -- must run once, right before doc.end(), after all
// content (so the total page count is known).
function drawFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  const pageWidth = doc.page.width;
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // PDFKit auto-adds a page when text() would land inside page.margins.bottom,
    // regardless of lineBreak -- and the footer band lives entirely in that zone.
    // Safe to zero out here since nothing else is drawn on these pages afterward.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - FOOTER_HEIGHT;
    doc.rect(0, y, pageWidth, FOOTER_HEIGHT).fill(COLORS.primarySoft);
    doc.moveTo(0, y).lineTo(pageWidth, y).lineWidth(1.5).strokeColor(COLORS.primary).stroke();

    doc.font("Helvetica").fontSize(8).fillColor(COLORS.textSecondary);
    doc.text("CSI Women's Fellowship — Treasurer App", PAGE_MARGIN, y + 12, {
      width: pageWidth / 2,
      align: "left",
      lineBreak: false,
    });
    doc.font("Helvetica-Bold").fillColor(COLORS.primaryDark);
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, pageWidth / 2, y + 12, {
      width: pageWidth / 2 - PAGE_MARGIN,
      align: "right",
      lineBreak: false,
    });
  }
  doc.fillColor(COLORS.textPrimary).font("Helvetica");
}

type SummaryRow = { label: string; value: string; emphasis?: boolean };

// A soft-purple, bordered card for the opening/closing-balance summary at
// the top of each section -- replaces the old plain stacked text lines.
function drawSummaryCard(doc: PDFKit.PDFDocument, title: string, rows: SummaryRow[]) {
  const pageWidth = doc.page.width;
  const cardX = PAGE_MARGIN;
  const cardWidth = pageWidth - PAGE_MARGIN * 2;
  const padding = 12;
  const rowHeight = 17;
  const titleHeight = 20;
  const cardTop = doc.y;
  const cardHeight = titleHeight + rows.length * rowHeight + padding * 2 - 4;

  if (cardTop + cardHeight > frameBottom(doc)) {
    doc.addPage();
  }
  const y = doc.y;

  doc.roundedRect(cardX, y, cardWidth, cardHeight, 6).fill(COLORS.primarySoft);
  doc.roundedRect(cardX, y, cardWidth, cardHeight, 6).lineWidth(1).strokeColor(COLORS.primary).stroke();

  doc.fillColor(COLORS.primaryDark).font("Helvetica-Bold").fontSize(12);
  doc.text(title, cardX + padding, y + padding - 2, { width: cardWidth - padding * 2 });

  let rowY = y + padding + titleHeight - 4;
  const half = cardWidth / 2;
  for (const row of rows) {
    doc.fontSize(10);
    doc.font(row.emphasis ? "Helvetica-Bold" : "Helvetica");
    doc.fillColor(row.emphasis ? COLORS.primaryDark : COLORS.textSecondary);
    doc.text(row.label, cardX + padding, rowY, { width: half, align: "left" });
    doc.fillColor(row.emphasis ? COLORS.primaryDark : COLORS.textPrimary);
    doc.text(row.value, cardX + half, rowY, { width: half - padding, align: "right" });
    rowY += rowHeight;
  }

  doc.fillColor(COLORS.textPrimary).font("Helvetica").fontSize(11);
  doc.x = PAGE_MARGIN;
  doc.y = y + cardHeight + 16;
}

function money(value: number): string {
  return `Rs. ${value.toFixed(2)}`;
}

// Converts an internal "YYYY-MM-DD" date string to the display format
// "DD-MM-YYYY". Ledger rows keep the ISO string for sorting/balance math —
// this only runs at render time, right before a date reaches the page.
function formatDisplayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, yyyy, mm, dd] = match;
  return `${dd}-${mm}-${yyyy}`;
}

export type ReportPdfData = {
  from: string;
  to: string;
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  closingBalance: number;
  expenses: { eventName: string | null; description: string; amount: string; status: string; date: string }[];
  contributions: { memberName: string; amount: string; date: string; note: string | null }[];
  cashFund: {
    openingBalance: number;
    totalIncome: number;
    totalOffering: number;
    totalDonation: number;
    totalExpenses: number;
    closingBalance: number;
    income: { type: string; amount: string; date: string; donorName: string | null; note: string | null }[];
    expenses: { description: string; amount: string; date: string }[];
  };
};

type LedgerRow = {
  date: string;
  description: string;
  credit: number;
  debit: number;
  status: string;
  balance: number;
};

// Merges contributions and expenses into one chronological cash-book ledger.
// The running balance only moves for credits and *paid* debits — pending
// expenses are shown (so the reader sees what's owed) but don't touch the
// balance, mirroring how closingBalance is computed in buildReport().
function buildLedgerRows(data: ReportPdfData): LedgerRow[] {
  type UnbalancedRow = Omit<LedgerRow, "balance"> & { order: number };
  const rows: UnbalancedRow[] = [];

  data.contributions.forEach((c, i) => {
    rows.push({
      date: c.date,
      description: c.note ? `${c.memberName} - ${c.note}` : c.memberName,
      credit: fromMoney(c.amount),
      debit: 0,
      status: "Received",
      order: i,
    });
  });

  data.expenses.forEach((e, i) => {
    rows.push({
      date: e.date,
      description: e.eventName ? `[${e.eventName}] ${e.description}` : e.description,
      credit: 0,
      debit: fromMoney(e.amount),
      status: e.status,
      order: data.contributions.length + i,
    });
  });

  rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)));

  let balance = data.openingBalance;
  return rows.map((r) => {
    balance += r.credit;
    if (r.debit > 0 && r.status.toLowerCase() === "paid") balance -= r.debit;
    return { ...r, balance };
  });
}

// Same LedgerRow shape as the bank ledger, reusing drawLedgerTable() below.
// Cash Fund has no pending state, so every debit reduces the running
// balance immediately (unlike buildLedgerRows(), which checks status).
export function buildCashLedgerRows(data: ReportPdfData["cashFund"]): LedgerRow[] {
  type UnbalancedRow = Omit<LedgerRow, "balance"> & { order: number };
  const rows: UnbalancedRow[] = [];

  data.income.forEach((inc, i) => {
    const label = inc.type === "donation" ? "Donation" : "Offering";
    const who = inc.type === "donation" && inc.donorName ? ` - ${inc.donorName}` : "";
    const noteSuffix = inc.note ? ` (${inc.note})` : "";
    rows.push({
      date: inc.date,
      description: `${label}${who}${noteSuffix}`,
      credit: fromMoney(inc.amount),
      debit: 0,
      status: "Received",
      order: i,
    });
  });

  data.expenses.forEach((e, i) => {
    rows.push({
      date: e.date,
      description: e.description,
      credit: 0,
      debit: fromMoney(e.amount),
      status: "Paid",
      order: data.income.length + i,
    });
  });

  rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)));

  let balance = data.openingBalance;
  return rows.map((r) => {
    balance += r.credit;
    balance -= r.debit;
    return { ...r, balance };
  });
}

const LEDGER_COLUMNS: { label: string; width: number; align: "left" | "right" }[] = [
  { label: "Date", width: 62, align: "left" },
  { label: "Description", width: 172, align: "left" },
  { label: "Credit", width: 62, align: "right" },
  { label: "Debit", width: 62, align: "right" },
  { label: "Status", width: 62, align: "left" },
  { label: "Balance", width: 88, align: "right" },
];

// Colorful, zebra-striped cash-book ledger: a filled purple header row,
// alternating row backgrounds, green credits, red debits, and a balance
// column colored by sign -- replaces the old plain black-on-white table.
function drawLedgerTable(doc: PDFKit.PDFDocument, rows: LedgerRow[]) {
  const startX = PAGE_MARGIN;
  const tableWidth = LEDGER_COLUMNS.reduce((sum, col) => sum + col.width, 0);
  const bottomLimit = frameBottom(doc);
  const CELL_PAD = 6;
  const HEADER_ROW_HEIGHT = 20;

  function drawHeaderRow() {
    const y = doc.y;
    doc.rect(startX, y, tableWidth, HEADER_ROW_HEIGHT).fill(COLORS.primary);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.white);
    let x = startX;
    for (const col of LEDGER_COLUMNS) {
      doc.text(col.label, x + CELL_PAD, y + 6, { width: col.width - CELL_PAD * 2, align: col.align });
      x += col.width;
    }
    doc.fillColor(COLORS.textPrimary).font("Helvetica");
    doc.x = startX;
    doc.y = y + HEADER_ROW_HEIGHT;
  }

  function drawDataRow(row: LedgerRow, rowIndex: number) {
    const values = [
      formatDisplayDate(row.date),
      row.description,
      row.credit > 0 ? row.credit.toFixed(2) : "",
      row.debit > 0 ? row.debit.toFixed(2) : "",
      row.status,
      row.balance.toFixed(2),
    ];
    const y = doc.y;
    doc.fontSize(9);
    const heights = values.map((v, i) => doc.heightOfString(v, { width: LEDGER_COLUMNS[i].width - CELL_PAD * 2 }));
    const rowHeight = Math.max(...heights, 11) + 8;

    if (rowIndex % 2 === 1) {
      doc.rect(startX, y, tableWidth, rowHeight).fill(COLORS.primarySoft);
    }

    let x = startX;
    for (let i = 0; i < LEDGER_COLUMNS.length; i++) {
      let color: string = COLORS.textPrimary;
      let bold = false;
      if (i === 2 && values[i]) color = COLORS.success;
      else if (i === 3 && values[i]) color = COLORS.danger;
      else if (i === 5) {
        bold = true;
        color = row.balance < 0 ? COLORS.danger : COLORS.textPrimary;
      }
      doc.fillColor(color).font(bold ? "Helvetica-Bold" : "Helvetica");
      doc.text(values[i], x + CELL_PAD, y + 4, { width: LEDGER_COLUMNS[i].width - CELL_PAD * 2, align: LEDGER_COLUMNS[i].align });
      x += LEDGER_COLUMNS[i].width;
    }

    doc.fillColor(COLORS.textPrimary).font("Helvetica");
    doc.x = startX;
    doc.y = y + rowHeight;

    doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).lineWidth(0.5).strokeColor(COLORS.border).stroke();
  }

  if (doc.y + HEADER_ROW_HEIGHT + 24 > bottomLimit) {
    doc.addPage();
  }
  drawHeaderRow();

  if (rows.length === 0) {
    doc.fillColor(COLORS.textMuted).fontSize(9).text("None in this period.", startX + CELL_PAD, doc.y + 6);
    doc.fillColor(COLORS.textPrimary);
    doc.x = startX;
    doc.y += 20;
    return;
  }

  rows.forEach((row, index) => {
    if (doc.y > bottomLimit - 24) {
      doc.addPage();
      drawHeaderRow();
    }
    drawDataRow(row, index);
  });
}

export function generateReportPdf(data: ReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    startDocument(doc, "Combined Treasurer Report", `Period: ${formatDisplayDate(data.from)} to ${formatDisplayDate(data.to)}`);

    drawSummaryCard(doc, "Bank Fund Summary", [
      { label: "Opening balance", value: money(data.openingBalance) },
      { label: "Contributions received", value: money(data.totalContributions) },
      { label: "Expenses paid", value: money(data.totalPaidExpenses) },
      { label: "Expenses pending", value: money(data.totalPendingExpenses) },
      { label: "Closing balance", value: money(data.closingBalance), emphasis: true },
    ]);

    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.primaryDark).text("Contributions & Expenses");
    doc.fillColor(COLORS.textPrimary).font("Helvetica").moveDown(0.4);
    drawLedgerTable(doc, buildLedgerRows(data));

    doc.moveDown(1.2);
    drawSummaryCard(doc, "Cash Fund Summary", [
      { label: "Opening balance", value: money(data.cashFund.openingBalance) },
      { label: "Offering received", value: money(data.cashFund.totalOffering) },
      { label: "Donations received", value: money(data.cashFund.totalDonation) },
      { label: "Expenses", value: money(data.cashFund.totalExpenses) },
      { label: "Closing balance", value: money(data.cashFund.closingBalance), emphasis: true },
    ]);

    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.primaryDark).text("Offering, Donations & Expenses");
    doc.fillColor(COLORS.textPrimary).font("Helvetica").moveDown(0.4);
    drawLedgerTable(doc, buildCashLedgerRows(data.cashFund));

    drawFooters(doc);
    doc.end();
  });
}

export type CashFundReportPdfData = ReportPdfData["cashFund"] & { from: string; to: string };

// Standalone Cash-Fund-only report -- backs the Report icon on the CashFlow
// screen's gradient card. Reuses the same ledger builder/table renderer as
// the combined report's Cash Fund section, just as its own document.
export function generateCashFundReportPdf(data: CashFundReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    startDocument(doc, "Cash Fund Report", `Period: ${formatDisplayDate(data.from)} to ${formatDisplayDate(data.to)}`);

    drawSummaryCard(doc, "Summary", [
      { label: "Opening balance", value: money(data.openingBalance) },
      { label: "Offering received", value: money(data.totalOffering) },
      { label: "Donations received", value: money(data.totalDonation) },
      { label: "Expenses", value: money(data.totalExpenses) },
      { label: "Closing balance", value: money(data.closingBalance), emphasis: true },
    ]);

    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.primaryDark).text("Offering, Donations & Expenses");
    doc.fillColor(COLORS.textPrimary).font("Helvetica").moveDown(0.4);
    drawLedgerTable(doc, buildCashLedgerRows(data));

    drawFooters(doc);
    doc.end();
  });
}

export type BankFundReportPdfData = {
  from: string;
  to: string;
  openingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  closingBalance: number;
  openingBalanceInHand: number;
  totalCashExpenseFromHand: number;
  totalEventExpensesPaidFromBank: number;
  closingBalanceInHand: number;
  bankTransactions: { type: string; description: string; amount: string; date: string }[];
  eventExpenses: { eventName: string | null; description: string; amount: string; date: string }[];
};

// Bank Balance ledger: only deposit/withdrawal transactions move this
// balance (matches the corrected getBalanceInputs() formula -- event
// spending is never paid directly from the bank).
function buildBankAccountLedgerRows(data: BankFundReportPdfData): LedgerRow[] {
  type UnbalancedRow = Omit<LedgerRow, "balance"> & { order: number };
  const rows: UnbalancedRow[] = [];

  data.bankTransactions
    .filter((t) => t.type === "deposit" || t.type === "withdrawal")
    .forEach((t, i) => {
      rows.push({
        date: t.date,
        description: t.description,
        credit: t.type === "deposit" ? fromMoney(t.amount) : 0,
        debit: t.type === "withdrawal" ? fromMoney(t.amount) : 0,
        status: t.type === "deposit" ? "Deposited" : "Withdrawn",
        order: i,
      });
    });

  rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)));

  let balance = data.openingBalance;
  return rows.map((r) => {
    balance += r.credit;
    balance -= r.debit;
    return { ...r, balance };
  });
}

// Balance in Hand ledger: withdrawals credit it (money moved from the bank
// into hand), cash_expense and bank-sourced paid event expenses debit it.
function buildHandLedgerRows(data: BankFundReportPdfData): LedgerRow[] {
  type UnbalancedRow = Omit<LedgerRow, "balance"> & { order: number };
  const rows: UnbalancedRow[] = [];

  data.bankTransactions
    .filter((t) => t.type === "withdrawal" || t.type === "cash_expense")
    .forEach((t, i) => {
      rows.push({
        date: t.date,
        description: t.description,
        credit: t.type === "withdrawal" ? fromMoney(t.amount) : 0,
        debit: t.type === "cash_expense" ? fromMoney(t.amount) : 0,
        status: t.type === "withdrawal" ? "Received" : "Spent",
        order: i,
      });
    });

  data.eventExpenses.forEach((e, i) => {
    rows.push({
      date: e.date,
      description: e.eventName ? `[${e.eventName}] ${e.description}` : e.description,
      credit: 0,
      debit: fromMoney(e.amount),
      status: "Spent",
      order: data.bankTransactions.length + i,
    });
  });

  rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)));

  let balance = data.openingBalanceInHand;
  return rows.map((r) => {
    balance += r.credit;
    balance -= r.debit;
    return { ...r, balance };
  });
}

// Standalone Bank-Fund-only report, mirroring generateCashFundReportPdf --
// backs the Report icon on BankFlow's gradient card. Two ledgers because
// Bank Fund has two balances (money in the bank vs. cash-in-hand withdrawn
// for events), unlike Cash Fund's single balance.
export function generateBankFundReportPdf(data: BankFundReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    startDocument(doc, "Bank Fund Report", `Period: ${formatDisplayDate(data.from)} to ${formatDisplayDate(data.to)}`);

    drawSummaryCard(doc, "Bank Balance", [
      { label: "Opening balance", value: money(data.openingBalance) },
      { label: "Deposited", value: money(data.totalDeposits) },
      { label: "Withdrawn", value: money(data.totalWithdrawals) },
      { label: "Closing balance", value: money(data.closingBalance), emphasis: true },
    ]);
    drawLedgerTable(doc, buildBankAccountLedgerRows(data));

    doc.moveDown(1.2);
    drawSummaryCard(doc, "Balance in Hand", [
      { label: "Opening balance", value: money(data.openingBalanceInHand) },
      { label: "Received from bank", value: money(data.totalWithdrawals) },
      { label: "Spent", value: money(data.totalCashExpenseFromHand + data.totalEventExpensesPaidFromBank) },
      { label: "Closing balance", value: money(data.closingBalanceInHand), emphasis: true },
    ]);
    drawLedgerTable(doc, buildHandLedgerRows(data));

    drawFooters(doc);
    doc.end();
  });
}

export type EventPdfData = {
  name: string;
  details: string | null;
  hasEventFund: boolean;
  totalPaid: number;
  totalPending: number;
  // Plain (no event fund) expense-only report -- unused when hasEventFund is true.
  expenses: { description: string; amount: string; status: string; date: string }[];
  // Present only when hasEventFund is true: the event's own Offering/Donation
  // fund is a self-contained cash book, so it gets a credit/debit/balance
  // ledger like Cash/Bank Fund instead of the plain expense table.
  eventFund?: {
    totalCollected: number;
    totalPendingCollection: number;
    totalPendingExpense: number;
    remaining: number;
    entries: {
      description: string;
      amount: string;
      status: string;
      date: string;
      txnType: "debit" | "credit";
      donorName: string | null;
    }[];
  };
};

const EVENT_COLUMNS: { label: string; width: number; align: "left" | "right" }[] = [
  { label: "Date", width: 70, align: "left" },
  { label: "Description", width: 250, align: "left" },
  { label: "Amount", width: 90, align: "right" },
  { label: "Status", width: 90, align: "left" },
];

// Event Fund ledger: same LedgerRow shape/table as Cash/Bank Fund, but here
// *both* sides only move the running balance once status is "paid" -- a
// pending credit (pledge) is exactly as unreal as a pending debit until it's
// confirmed, matching eventFundRemaining's own filter in storage/events.ts.
function buildEventFundLedgerRows(entries: NonNullable<EventPdfData["eventFund"]>["entries"]): LedgerRow[] {
  type UnbalancedRow = Omit<LedgerRow, "balance"> & { order: number; paid: boolean };
  const rows: UnbalancedRow[] = entries.map((e, i) => {
    const paid = e.status === "paid";
    return {
      date: e.date,
      description: e.donorName ? `${e.description} - ${e.donorName}` : e.description,
      credit: e.txnType === "credit" ? fromMoney(e.amount) : 0,
      debit: e.txnType === "debit" ? fromMoney(e.amount) : 0,
      status: paid ? (e.txnType === "credit" ? "Received" : "Paid") : "Pending",
      order: i,
      paid,
    };
  });

  rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)));

  let balance = 0;
  return rows.map(({ paid, ...r }) => {
    if (paid) balance += r.credit - r.debit;
    return { ...r, balance };
  });
}

// Same visual language as drawLedgerTable (colored header, zebra stripes)
// but a simpler 4-column shape -- event expenses have no running balance.
function drawEventExpenseTable(doc: PDFKit.PDFDocument, expenses: EventPdfData["expenses"]) {
  const startX = PAGE_MARGIN;
  const tableWidth = EVENT_COLUMNS.reduce((sum, col) => sum + col.width, 0);
  const bottomLimit = frameBottom(doc);
  const CELL_PAD = 6;
  const HEADER_ROW_HEIGHT = 20;

  function drawHeaderRow() {
    const y = doc.y;
    doc.rect(startX, y, tableWidth, HEADER_ROW_HEIGHT).fill(COLORS.primary);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.white);
    let x = startX;
    for (const col of EVENT_COLUMNS) {
      doc.text(col.label, x + CELL_PAD, y + 6, { width: col.width - CELL_PAD * 2, align: col.align });
      x += col.width;
    }
    doc.fillColor(COLORS.textPrimary).font("Helvetica");
    doc.x = startX;
    doc.y = y + HEADER_ROW_HEIGHT;
  }

  if (doc.y + HEADER_ROW_HEIGHT + 24 > bottomLimit) {
    doc.addPage();
  }
  drawHeaderRow();

  if (expenses.length === 0) {
    doc.fillColor(COLORS.textMuted).fontSize(9).text("None recorded for this event.", startX + CELL_PAD, doc.y + 6);
    doc.fillColor(COLORS.textPrimary);
    doc.x = startX;
    doc.y += 20;
    return;
  }

  expenses.forEach((e, index) => {
    if (doc.y > bottomLimit - 24) {
      doc.addPage();
      drawHeaderRow();
    }
    const values = [formatDisplayDate(e.date), e.description, `Rs. ${fromMoney(e.amount).toFixed(2)}`, e.status];
    const y = doc.y;
    doc.fontSize(9);
    const heights = values.map((v, i) => doc.heightOfString(v, { width: EVENT_COLUMNS[i].width - CELL_PAD * 2 }));
    const rowHeight = Math.max(...heights, 11) + 8;

    if (index % 2 === 1) {
      doc.rect(startX, y, tableWidth, rowHeight).fill(COLORS.primarySoft);
    }

    let x = startX;
    for (let i = 0; i < EVENT_COLUMNS.length; i++) {
      const isStatus = i === 3;
      let statusColor = COLORS.textPrimary;
      if (isStatus) statusColor = e.status.toLowerCase() === "paid" ? COLORS.success : COLORS.danger;
      doc.fillColor(statusColor);
      doc.font(isStatus ? "Helvetica-Bold" : "Helvetica");
      doc.text(values[i], x + CELL_PAD, y + 4, { width: EVENT_COLUMNS[i].width - CELL_PAD * 2, align: EVENT_COLUMNS[i].align });
      x += EVENT_COLUMNS[i].width;
    }

    doc.fillColor(COLORS.textPrimary).font("Helvetica");
    doc.x = startX;
    doc.y = y + rowHeight;
    doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).lineWidth(0.5).strokeColor(COLORS.border).stroke();
  });
}

export function generateEventReportPdf(data: EventPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    startDocument(doc, data.name, data.details || "Event Report");

    if (data.hasEventFund && data.eventFund) {
      const fund = data.eventFund;
      drawSummaryCard(doc, "Summary", [
        { label: "Collected", value: money(fund.totalCollected) },
        { label: "Pending collection", value: money(fund.totalPendingCollection) },
        { label: "Expenses", value: money(data.totalPaid) },
        { label: "Pending expenses", value: money(fund.totalPendingExpense) },
        { label: "Balance", value: money(fund.remaining), emphasis: true },
      ]);

      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.primaryDark).text("Offering, Donations & Expenses");
      doc.fillColor(COLORS.textPrimary).font("Helvetica").moveDown(0.4);
      drawLedgerTable(doc, buildEventFundLedgerRows(fund.entries));
    } else {
      drawSummaryCard(doc, "Summary", [
        { label: "Paid", value: money(data.totalPaid) },
        { label: "Pending", value: money(data.totalPending), emphasis: true },
      ]);

      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.primaryDark).text("Expenses");
      doc.fillColor(COLORS.textPrimary).font("Helvetica").moveDown(0.4);
      drawEventExpenseTable(doc, data.expenses);
    }

    drawFooters(doc);
    doc.end();
  });
}
