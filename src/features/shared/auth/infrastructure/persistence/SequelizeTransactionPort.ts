import sequelize from "@/config/db.js";
import { Transaction } from "sequelize";
import { TransactionPort } from "../../application/ports/TransactionPort.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export class SequelizeTransactionPort implements TransactionPort {
  async runInTransaction<T>(
    fn: (tx: PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    return sequelize.transaction(async (transaction: Transaction) => {
      return fn(transaction);
    });
  }
}
