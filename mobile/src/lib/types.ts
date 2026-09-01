export type Member = {
  id: number;
  name: string;
  santhaNumber: string;
  phone: string | null;
  address: string | null;
  age: number | null;
  createdAt: string;
  updatedAt: string;
};

export type MemberAttributeValue = {
  id: number;
  memberId: number;
  attributeKey: string;
  value: string | null;
};

export type MemberWithAttributes = Member & { attributes: MemberAttributeValue[] };

export type AttributeType = "text" | "number" | "date" | "list";

export type AttributeDefinition = {
  id: number;
  key: string;
  label: string;
  type: AttributeType;
  options: string[] | null;
  createdAt: string;
};

export type EventSummary = {
  id: number;
  name: string;
  details: string | null;
  createdAt: string;
  totalPaid: number;
};

export type EventDetail = {
  id: number;
  name: string;
  details: string | null;
  createdAt: string;
};

export type ExpenseStatus = "paid" | "pending";

export type Expense = {
  id: number;
  eventId: number | null;
  description: string;
  amount: number;
  receiptPhotoUrl: string | null;
  status: ExpenseStatus;
  date: string;
  createdAt: string;
};

export type Contribution = {
  id: number;
  memberId: number;
  amount: number;
  date: string;
  note: string | null;
  createdAt: string;
};

export type BalanceResponse = {
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  balance: number;
};

export type ReportExpenseRow = {
  eventName: string | null;
  description: string;
  amount: number;
  status: ExpenseStatus;
  date: string;
};

export type ReportContributionRow = {
  memberName: string;
  amount: number;
  date: string;
  note: string | null;
};

export type ReportResponse = {
  from: string;
  to: string;
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  closingBalance: number;
  expenses: ReportExpenseRow[];
  contributions: ReportContributionRow[];
};
