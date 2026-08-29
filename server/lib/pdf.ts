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

export function generateReportPdf(data: ReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("CSI Women's Fellowship - Treasurer Report", { align: "center" });
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

    doc.fontSize(13).text("Contributions");
    doc.fontSize(10);
    if (data.contributions.length === 0) doc.text("None in this period.");
    for (const c of data.contributions) {
      doc.text(`${c.date}  ${c.memberName}  Rs. ${fromMoney(c.amount).toFixed(2)}${c.note ? `  (${c.note})` : ""}`);
    }
    doc.moveDown(1.5);

    doc.fontSize(13).text("Expenses");
    doc.fontSize(10);
    if (data.expenses.length === 0) doc.text("None in this period.");
    for (const e of data.expenses) {
      doc.text(
        `${e.date}  [${e.eventName ?? "General"}]  ${e.description}  Rs. ${fromMoney(e.amount).toFixed(2)}  (${e.status})`
      );
    }

    doc.end();
  });
}
