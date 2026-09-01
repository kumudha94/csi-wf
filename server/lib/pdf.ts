import PDFDocument from "pdfkit";
import { fromMoney } from "./money";

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

const LEDGER_COLUMNS: { label: string; width: number; align: "left" | "right" }[] = [
  { label: "Date", width: 65, align: "left" },
  { label: "Description", width: 180, align: "left" },
  { label: "Credit", width: 65, align: "right" },
  { label: "Debit", width: 65, align: "right" },
  { label: "Status", width: 65, align: "left" },
  { label: "Balance", width: 92, align: "right" },
];

function drawLedgerTable(doc: PDFKit.PDFDocument, rows: LedgerRow[]) {
  const startX = doc.page.margins.left;
  const tableWidth = LEDGER_COLUMNS.reduce((sum, col) => sum + col.width, 0);
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  const GUTTER = 8; // gap reserved at the right of each column so adjacent text never touches

  function drawRowCells(values: string[], font: "Helvetica" | "Helvetica-Bold") {
    doc.font(font);
    const y = doc.y;
    const heights = values.map((v, i) => doc.heightOfString(v, { width: LEDGER_COLUMNS[i].width - GUTTER }));
    const rowHeight = Math.max(...heights, 12);
    let x = startX;
    for (let i = 0; i < LEDGER_COLUMNS.length; i++) {
      doc.text(values[i], x, y, { width: LEDGER_COLUMNS[i].width - GUTTER, align: LEDGER_COLUMNS[i].align });
      x += LEDGER_COLUMNS[i].width;
    }
    doc.font("Helvetica");
    doc.y = y + rowHeight + 4;
  }

  function drawHeader() {
    drawRowCells(
      LEDGER_COLUMNS.map((c) => c.label),
      "Helvetica-Bold"
    );
    doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).stroke();
    doc.moveDown(0.4);
  }

  drawHeader();

  if (rows.length === 0) {
    doc.text("None in this period.");
    return;
  }

  for (const row of rows) {
    if (doc.y > bottomLimit - 20) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHeader();
    }
    drawRowCells(
      [
        row.date,
        row.description,
        row.credit > 0 ? row.credit.toFixed(2) : "",
        row.debit > 0 ? row.debit.toFixed(2) : "",
        row.status,
        row.balance.toFixed(2),
      ],
      "Helvetica"
    );
  }
}

export function generateReportPdf(data: ReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("CSI Women's Fellowship", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Period: ${data.from} to ${data.to}`, { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(13).text("Summary");
    doc.fontSize(11);
    doc.text(`Opening balance: Rs. ${data.openingBalance.toFixed(2)}`);
    doc.text(`Contributions received: Rs. ${data.totalContributions.toFixed(2)}`);
    doc.text(`Expenses paid: Rs. ${data.totalPaidExpenses.toFixed(2)}`);
    doc.text(`Expenses pending: Rs. ${data.totalPendingExpenses.toFixed(2)}`);
    doc.font("Helvetica-Bold").text(`Closing balance: Rs. ${data.closingBalance.toFixed(2)}`);
    doc.font("Helvetica");
    doc.moveDown(1.5);

    doc.fontSize(13).text("Contributions & Expenses");
    doc.moveDown(0.3);
    doc.fontSize(9);
    drawLedgerTable(doc, buildLedgerRows(data));

    doc.end();
  });
}

export type EventPdfData = {
  name: string;
  details: string | null;
  totalPaid: number;
  totalPending: number;
  expenses: { description: string; amount: string; status: string; date: string }[];
};

export function generateEventReportPdf(data: EventPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(`CSI Women's Fellowship - ${data.name}`, { align: "center" });
    if (data.details) {
      doc.moveDown(0.3);
      doc.fontSize(11).text(data.details, { align: "center" });
    }
    doc.moveDown(1.5);

    doc.fontSize(13).text("Summary");
    doc.fontSize(11);
    doc.text(`Paid: Rs. ${data.totalPaid.toFixed(2)}`);
    doc.text(`Pending: Rs. ${data.totalPending.toFixed(2)}`);
    doc.moveDown(1.5);

    doc.fontSize(13).text("Expenses");
    doc.fontSize(10);
    if (data.expenses.length === 0) doc.text("None recorded for this event.");
    for (const e of data.expenses) {
      doc.text(`${e.date}  ${e.description}  Rs. ${fromMoney(e.amount).toFixed(2)}  (${e.status})`);
    }

    doc.end();
  });
}
