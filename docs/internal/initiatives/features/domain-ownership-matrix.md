# Feature Domain Ownership Matrix

- Timestamp: 2025-12-02T14:20:00Z

| Feature         | Primary Owner           | Backup Owner          | Notes                                                                               |
| --------------- | ----------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| Metric          | Backend Team (Dimas P.) | Backend Guild         | First to migrate after Metric Category; critical for core CRUD and analytics feeds. |
| Metric Logs     | Backend Team (Dimas P.) | Data/Insights Partner | Heavy writer workload; coordinate with metrics for cache invalidation.              |
| Metric Category | Backend Team (Dimas P.) | Product Engineering   | Already in vertical slice structure; acts as reference implementation.              |
| Metric Settings | Product Engineering     | Backend Team          | Depends on Metric feature; migration blocked until Metric slice stable.             |
| Analytics       | Data/Insights Partner   | Backend Team          | Ensure reporting contracts documented before moving controllers.                    |
| Auth            | Platform Team           | Backend Team          | Needs careful coordination with middleware/session layers.                          |

## Usage

- Keep this matrix updated whenever ownership rotates.
- Reference it in retros or incident reports to identify accountable squads.
- When opening migration tickets, assign them to the listed primary owner.
