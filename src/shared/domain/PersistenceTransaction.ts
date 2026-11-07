/**
 * A transaction handle, as a repository or a port passes it along. Opaque to the
 * domain and application layers; the adapter decides what a transaction is.
 */
export type PersistenceTransaction = unknown;
