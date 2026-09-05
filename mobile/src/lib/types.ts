export type MemberStatus = "active" | "inactive" | "died";

export type Member = {
  id: number;
  name: string;
  lastName: string | null;
  santhaNumber: string;
  oldMemNo: string | null;
  phone: string | null;
  address: string | null;
  age: number | null;
  remarks: string | null;
  status: MemberStatus;
  defaultAmount: number;
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
  eventDate: string | null;
  createdAt: string;
  totalPaid: number;
};

export type EventDetail = {
  id: number;
  name: string;
  details: string | null;
  eventDate: string | null;
  createdAt: string;
};

export type ExpenseStatus = "paid" | "pending";

export type ExpenseFundSource = "bank" | "cash";

export type Expense = {
  id: number;
  eventId: number | null;
  description: string;
  amount: number;
  receiptPhotoUrl: string | null;
  status: ExpenseStatus;
  fundSource: ExpenseFundSource;
  date: string;
  createdAt: string;
};

export type Contribution = {
  id: number;
  memberId: number;
  amount: number;
  date: string;
  forMonth: string;
  note: string | null;
  createdAt: string;
};

export type BankTransactionType = "deposit" | "withdrawal" | "cash_expense";

export type BankTransaction = {
  id: number;
  type: BankTransactionType;
  description: string;
  amount: number;
  date: string;
  receiptPhotoUrl: string | null;
  createdAt: string;
};

export type MemberCollectionStatus = {
  memberId: number;
  name: string;
  santhaNumber: string;
  defaultAmount: number;
  paidThisMonth: boolean;
  currentMonthContributionId: number | null;
  currentMonthAmount: number | null;
  currentMonthDate: string | null;
  missingMonths: string[];
};

export type CashIncomeType = "offering" | "donation";

export type CashFundIncome = {
  id: number;
  type: CashIncomeType;
  amount: number;
  date: string;
  donorName: string | null;
  note: string | null;
  createdAt: string;
};

export type CashFundExpense = {
  id: number;
  description: string;
  amount: number;
  date: string;
  receiptPhotoUrl: string | null;
  createdAt: string;
};

export type BankFundBalance = {
  openingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  balance: number;
  balanceInHand: number;
  depositStatus: { monthLabel: string; completed: boolean };
};

export type CashFundBalanceSummary = {
  openingBalance: number;
  totalIncome: number;
  totalOffering: number;
  totalDonation: number;
  totalExpenses: number;
  balance: number;
};

export type BalanceResponse = {
  bankFund: BankFundBalance;
  cashFund: CashFundBalanceSummary;
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

export type ReportCashIncomeRow = {
  type: CashIncomeType;
  amount: number;
  date: string;
  donorName: string | null;
  note: string | null;
};

export type ReportCashExpenseRow = {
  description: string;
  amount: number;
  date: string;
};

export type ReportCashFund = {
  openingBalance: number;
  totalIncome: number;
  totalOffering: number;
  totalDonation: number;
  totalExpenses: number;
  closingBalance: number;
  income: ReportCashIncomeRow[];
  expenses: ReportCashExpenseRow[];
};

export type DashboardSummary = {
  monthLabel: string;
  weekOfMonth: number;
  bank: { balance: number; inHand: number; depositStatus: { monthLabel: string; completed: boolean } };
  cash: { balance: number };
  members: { total: number; active: number; inactive: number; died: number; newThisMonth: number };
  contributions: { thisMonth: number; thisWeek: number; total: number };
  offering: { thisMonth: number; thisWeek: number; total: number };
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
  cashFund: ReportCashFund;
};
