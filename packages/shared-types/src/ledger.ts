export type AccountType = "cash" | "credit" | "expense" | "income" | "liability" | "equity";

export type ReviewStatus = "unreviewed" | "reviewed" | "flagged";

export type ImportBatchStatus = "pending" | "processing" | "completed" | "failed";

export type ReconciliationSessionStatus = "in_progress" | "completed";

export type Account = {
  id: string;
  organizationId: string;
  name: string;
  type: AccountType;
  code?: string | null;
  isActive: boolean;
  createdAt: string;
};

export type Category = {
  id: string;
  organizationId: string;
  name: string;
  parentId?: string | null;
  color?: string | null;
  isActive: boolean;
};

export type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

export type Transaction = {
  id: string;
  organizationId: string;
  accountId: string;
  date: string;
  amount: number;
  description?: string | null;
  merchantRaw?: string | null;
  categoryId?: string | null;
  reviewStatus: ReviewStatus;
  importBatchId?: string | null;
  isSplit: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ImportBatchRowStatus = "imported" | "duplicate" | "error" | "skipped";

export type TransactionFilters = {
  accountId?: string;
  amountMax?: number;
  amountMin?: number;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  page: number;
  q?: string;
  status?: ReviewStatus;
};

export type TransactionListResponse = {
  data: Transaction[];
  meta: {
    hasMore: boolean;
    limit: number;
    page: number;
    total: number;
  };
};

export type ImportBatchRowResult = {
  amount: number | null;
  date: string | null;
  description: string | null;
  message: string | null;
  rowNumber: number;
  status: ImportBatchRowStatus;
  transactionId: string | null;
};

export type TransactionLine = {
  id: string;
  transactionId: string;
  organizationId: string;
  amount: number;
  categoryId?: string | null;
  description?: string | null;
};

export type ImportBatch = {
  id: string;
  organizationId: string;
  accountId: string;
  createdBy: string;
  filename: string | null;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
  status: ImportBatchStatus;
  createdAt: string;
  updatedAt: string;
};

export type ImportBatchDetail = ImportBatch & {
  rows: ImportBatchRowResult[];
};

export type ReconciliationSession = {
  id: string;
  organizationId: string;
  accountId: string;
  statementDate?: string | null;
  statementBalance?: number | null;
  status: ReconciliationSessionStatus;
  completedAt?: string | null;
  createdAt: string;
};
