export type PersistenceTransaction = unknown;

export interface TransactionPort {
  runInTransaction<T>(
    fn: (tx: PersistenceTransaction) => Promise<T>,
  ): Promise<T>;
}
