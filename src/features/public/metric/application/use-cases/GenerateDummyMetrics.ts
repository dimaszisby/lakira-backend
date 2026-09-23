import { Metric } from "../../domain/entities/Metric.js";
import { MetricRepository } from "../../domain/repositories/MetricRepository.js";
import { CachePort } from "../ports/CachePort.js";
import { TransactionPort } from "../ports/TransactionPort.js";

type Input = {
  userId: string;
  organizationId: string;
  count: number;
};

const DEFAULT_UNITS = ["kg", "steps", "ml", "units"];

export class GenerateDummyMetrics {
  constructor(
    private repo: MetricRepository,
    private cache: CachePort,
    private tx: TransactionPort,
  ) {}

  async execute({ userId, organizationId, count }: Input): Promise<Metric[]> {
    // One transaction for the batch: a dummy run that fails halfway used to leave
    // however many rows it had already written.
    const dummyMetrics = await this.tx.runInTransaction(async (t) => {
      const created: Metric[] = [];
      for (let i = 0; i < count; i++) {
        created.push(
          await this.repo.create(
            {
              userId,
              organizationId,
              name: `Dummy Metric ${Date.now()}-${i}`,
              description:
                "This is a dummy metric generated for testing pagination.",
              defaultUnit:
                DEFAULT_UNITS[Math.floor(Math.random() * DEFAULT_UNITS.length)],
              isPublic: Math.random() > 0.5,
            },
            t,
          ),
        );
      }
      return created;
    });

    if (this.cache.isEnabled()) {
      await this.cache.invalidateMetrics(userId, organizationId);
    }

    return dummyMetrics;
  }
}
