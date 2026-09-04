import ExcelJS from "exceljs";
import type { Member } from "@shared/schema";

export const SECONDARY_MEMBER_COLUMNS = {
  oldMemNo: { header: "Old Santha No", value: (m: Member) => m.oldMemNo ?? "" },
  phone: { header: "Phone Number", value: (m: Member) => m.phone ?? "" },
  age: { header: "Age", value: (m: Member) => m.age ?? "" },
  address: { header: "Address", value: (m: Member) => m.address ?? "" },
  remarks: { header: "Remarks", value: (m: Member) => m.remarks ?? "" },
} as const;

export type SecondaryColumnKey = keyof typeof SECONDARY_MEMBER_COLUMNS;

export function isSecondaryColumnKey(value: string): value is SecondaryColumnKey {
  return value in SECONDARY_MEMBER_COLUMNS;
}

const STATUS_LABEL: Record<Member["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  died: "Died",
};

// `extraColumns` are blank print-only columns (e.g. "Signature") for the
// treasurer to fill by hand after printing — they carry no data.
export async function generateMembersXlsx(
  memberRows: Member[],
  secondaryColumns: SecondaryColumnKey[],
  extraColumns: string[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Members");

  sheet.columns = [
    { header: "Santha No", key: "santhaNumber", width: 14 },
    { header: "Name", key: "name", width: 20 },
    { header: "Last Name", key: "lastName", width: 18 },
    { header: "Status", key: "status", width: 12 },
    ...secondaryColumns.map((key) => ({ header: SECONDARY_MEMBER_COLUMNS[key].header, key, width: 18 })),
    ...extraColumns.map((label, i) => ({ header: label, key: `extra_${i}`, width: 18 })),
  ];
  sheet.getRow(1).font = { bold: true };

  for (const member of memberRows) {
    const row: Record<string, string | number> = {
      santhaNumber: member.santhaNumber,
      name: member.name,
      lastName: member.lastName ?? "",
      status: STATUS_LABEL[member.status],
    };
    for (const key of secondaryColumns) {
      row[key] = SECONDARY_MEMBER_COLUMNS[key].value(member);
    }
    extraColumns.forEach((_, i) => {
      row[`extra_${i}`] = "";
    });
    sheet.addRow(row);
  }

  // exceljs's own .d.ts shadows the global `Buffer` with a bare ArrayBuffer-like
  // interface, so writeBuffer()'s declared return type isn't assignable to
  // Node's real Buffer even though it returns one at runtime — wrap it.
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
