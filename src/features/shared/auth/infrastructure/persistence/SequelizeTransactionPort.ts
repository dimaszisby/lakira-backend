import sequelize from "@/config/db.js";
import { Transaction } from "sequelize";
import {
  TransactionPort,
  PersistenceTransaction,
} from "../../application/ports/TransactionPort.js";

export class SequelizeTransactionPort implements TransactionPort {
  async runInTransaction<T>(
    fn: (tx: PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    return sequelize.transaction(async (transaction: Transaction) => {
      return fn(transaction);
    });
  }
}
