import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export interface TransactionPort {
  runInTransaction<T>(
    fn: (tx: PersistenceTransaction) => Promise<T>,
  ): Promise<T>;
}
