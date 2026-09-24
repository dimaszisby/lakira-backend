# PostgreSQL with Docker: A Comprehensive Guide

This guide provides step-by-step instructions on how to install, configure, and operate PostgreSQL using Docker. It covers pulling the official image, creating and running a container with persistent data storage, connecting to the database, initializing the database, backing up and restoring, troubleshooting, and common deployment architectures.

## Prerequisites

- Docker installed on your system.
- Basic understanding of Docker concepts.

## 0. Test Workflow & Troubleshooting

Use this backend’s Docker Compose harness only when you need full-stack parity (CI, pre-release validation). For everyday Jest iterations, run `npm run test:dev` on the host or let the VS Code Jest extension invoke it automatically. When you need the containerized suite:

```bash
npm run test:ci
```

This command proxies to `scripts/test-ci.sh`, which runs `docker compose down -v` (this **deletes
the Compose volumes**, including any local development data), builds the app image, starts `db`,
`redis` and `rabbitmq`, waits for Postgres, runs migrations, then runs the unit suite, the
integration suite and integration coverage inside the `app` container. It does **not** forward
extra arguments, so `npm run test:ci -- --coverage` silently drops `--coverage`; use
`npm run test:unit:coverage` / `npm run test:integration:coverage` for coverage. If VS Code shows “The Compose app is no longer running,” it simply means the teardown in `test-ci.sh` completed—re-run the command to spin everything back up, or inspect `docker compose -f docker-compose.yml -f docker-compose.test.yml ps -a` for lingering containers.

**Host-side migrations:** When you run Jest directly on macOS/Linux without spinning up the `app` container, the Sequelize CLI still needs the Dockerized Postgres schema. Define the host override before invoking the CLI so it speaks to `127.0.0.1` instead of the Compose hostname `db`:

```bash
TEST_DATABASE_URL=postgres://lakira_user:lakira_password@127.0.0.1:5432/lakira_test_db \
DB_HOST=127.0.0.1 \
NODE_ENV=test \
npx sequelize-cli db:migrate --config src/config/config.cjs --migrations-path src/migrations
```

Both flags are required: there is no `.sequelizerc`, so without `--migrations-path` the CLI looks in
`./migrations`, which does not exist.

Run the same command whenever you drop local volumes. CI already injects these values inside the `app` container, so no change is required there.

---

## 1. Pulling the Official PostgreSQL Image -> DONE

The first step is to pull the official PostgreSQL image from Docker Hub. This image provides a pre-configured PostgreSQL environment that you can use to create containers.

```bash
docker pull postgres:18
```

This command pulls the `postgres:18` image — the same major and the same Debian (glibc) base as Compose and CI. Do not swap in an `-alpine` tag: musl sorts text differently from glibc, which changes cursor-pagination order (see `docs/reference/environments.md`). Consider a specific version tag (e.g., `postgres:18.1`) for production to avoid unexpected updates.

## 2. Creating and Running a Container with Persistent Data Storage -> DONE

To create and run a PostgreSQL container with persistent data storage, you need to create a Docker volume. This volume will store the database data and ensure that it is not lost when the container is stopped or removed.

```bash
docker volume create pgdata
```

This command creates a Docker volume named `pgdata`. You can then use this volume when creating the container.

```bash
docker run -d \
  --name postgres_db \
  -v pgdata:/var/lib/postgresql/data \
  -p 5432:5432 \
  -e POSTGRES_USER=your_db_user \
  -e POSTGRES_PASSWORD=your_db_password \
  -e POSTGRES_DB=your_db_name \
  -e PGDATA=/var/lib/postgresql/data \
  postgres:18
```

-- Dev DB

```bash
docker run -d \
  --name postgres_db \
  -v pgdata:/var/lib/postgresql/data \
  -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=lakira_development \
  -e PGDATA=/var/lib/postgresql/data \
  postgres:18
```

This command creates and runs a PostgreSQL container named `postgres_db`. It mounts the `pgdata` volume to the `/var/lib/postgresql/data` directory inside the container, which is where PostgreSQL stores its data. It also exposes port 5432 on the host machine, allowing you to connect to the database from your local machine. The `-e` flags set the environment variables for the database user, password, and database name. Replace `your_db_user`, `your_db_password`, and `your_db_name` with your desired values. The `PGDATA` environment variable explicitly sets the data directory.

## 3. Connecting to the Database from the Host Machine -> DONE

You can connect to the PostgreSQL database from your host machine using any PostgreSQL client, such as `psql`.

```bash
psql -h localhost -p 5432 -U your_db_user -d your_db_name
```

-- NOTE: For development database

```bash
psql -h localhost -p 5432 -U postgres -d lakira_development
```

This command connects to the PostgreSQL database running in the Docker container. Replace `your_db_user` and `your_db_name` with the values you set in the previous step.

## 4. Initializing the Database with Custom Settings

You can initialize the database with custom settings by running SQL commands inside the container. To do this, you can use the `docker exec` command.

```bash
docker exec -it postgres_db psql -U postgres
```

This command opens a `psql` shell inside the `postgres_db` container. You can then run SQL commands to create users, databases, and set passwords.

For example, to create a new user and database, you can run the following commands:

```sql
CREATE USER myuser WITH PASSWORD 'mypassword';
CREATE DATABASE mydb OWNER myuser;
GRANT ALL PRIVILEGES ON DATABASE mydb TO myuser;
```

The `GRANT ALL PRIVILEGES` command ensures the user has the necessary permissions.

## 5. Backing Up and Restoring the Database

You can back up the PostgreSQL database by using the `pg_dump` command inside the container.

```bash
docker exec -it postgres_db pg_dump -U your_db_user -d your_db_name > backup.sql
```

This command creates a backup of the `your_db_name` database and saves it to a file named `backup.sql` on your host machine.

To restore the database from a backup, you can use the `psql` command.

```bash
docker exec -i postgres_db psql -U your_db_user -d your_db_name < backup.sql
```

This command restores the database from the `backup.sql` file.

For larger databases, consider using `pg_dump` with compression (e.g., `pg_dump ... | gzip > backup.sql.gz`) and streaming the backup directly to a storage service.

## 6. PostgreSQL Architecture Overview

PostgreSQL's architecture is based on a client/server model. The core components include:

- **Postmaster:** The main process that listens for incoming connections and spawns new server processes.
- **Server Processes:** Each client connection is handled by a dedicated server process.
- **Background Processes:** These processes perform various maintenance tasks, such as autovacuuming, WAL archiving, and statistics collection.
- **Shared Memory:** Used for communication and data sharing between processes.

[Diagram of PostgreSQL Architecture]

## 7. PostgreSQL Extensions in Docker

PostgreSQL extensions enhance the functionality of the database. To use extensions in Docker, you need to install them in the container.

First, find the extension you want to install. For example, to install the `uuid-ossp` extension:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

You might need to install additional packages in the Docker container to support certain extensions. This can be done by extending the base PostgreSQL image with a custom Dockerfile:

```dockerfile
FROM postgres:18

RUN apk add --no-cache postgresql-dev uuid-dev
```

Then, rebuild your Docker image and run the container.

## 8. Common Deployment Architectures

### Single Instance

The simplest architecture is a single PostgreSQL instance running in a Docker container. This is suitable for development and small production environments.

[Diagram of Single Instance Architecture]

### Primary/Replica

For high availability and read scalability, you can deploy a primary/replica architecture. The primary instance handles write operations, while the replica instances handle read operations. Data is replicated from the primary to the replicas using PostgreSQL's built-in replication features.

[Diagram of Primary/Replica Architecture]

To configure replication in Docker, you need to set up the primary and replica instances and configure the replication settings in the `postgresql.conf` file.

### Sharded

For very large databases, you can use a sharded architecture. The data is divided into multiple shards, each running on a separate PostgreSQL instance. This allows you to scale the database horizontally.

[Diagram of Sharded Architecture]

Implementing sharding requires careful planning and application-level logic to route queries to the correct shard.

## 9. Troubleshooting

Here are some common issues encountered when running PostgreSQL in Docker and how to troubleshoot them:

- **Connection refused:** Make sure the PostgreSQL container is running and that the port 5432 is exposed. Check Docker logs for errors.
- **Authentication failed:** Make sure you are using the correct username and password. Verify the environment variables are set correctly.
- **Data loss:** Make sure you are using a Docker volume to persist the data. Check the volume configuration.
- **Performance issues:** Monitor the container's resource usage (CPU, memory, disk I/O). Adjust resource limits in the `docker-compose.yml` file.

## 10. Best Practices for Security and Data Management

- **Use strong passwords:** Always use strong passwords for your database users.
- **Restrict access:** Restrict access to the database to only the necessary users and applications. Use network policies to limit access to the container.
- **Regular backups:** Create regular backups of your database to protect against data loss. Automate backups using a cron job or a dedicated backup service.
- **Secure your Docker environment:** Follow best practices for securing your Docker environment. Use a minimal base image, scan for vulnerabilities, and keep your Docker version up to date.
- **Monitor your database:** Monitor the database for performance issues and security threats. Use monitoring tools to track key metrics.
- **Use a dedicated network:** Place your PostgreSQL container on a dedicated Docker network to isolate it from other containers.
- **Limit resource usage:** Set resource limits (CPU, memory) for the container to prevent it from consuming excessive resources.

## 11. Addressing Version Discrepancies and Upgrades

When running Docker containers, it's important to stay up-to-date with the latest versions of the images to address potential security vulnerabilities, performance improvements, and compatibility concerns. Tools like `docker scout quickview` can help identify discrepancies between the running container and the available versions.

### 11.1. Investigating the Discrepancy

If `docker scout quickview postgres:18` indicates that a newer version (e.g., 1.17.0) is available, follow these steps to investigate:

1.  **Verify the Reported Version:**
    - First, confirm the currently running PostgreSQL version inside the container:

    ```bash
    docker exec -it postgres_db psql -U postgres -c "SELECT version();"
    ```

    - Compare this version with the version reported by `docker scout quickview`.

2.  **Identify the Source of the Update Recommendation:**
    - `docker scout quickview` might be recommending an update due to:
      - **Base Image Updates:** The `postgres:18` base image itself has been updated with a newer PostgreSQL version.
      - **Package Updates:** The Alpine Linux packages within the image have been updated.

3.  **Check the Changelog:**
    - Review the PostgreSQL release notes for the recommended version (e.g., 1.17.0) to understand the changes, bug fixes, and security improvements.
    - Also, check the Alpine Linux changelog for any relevant package updates.

### 11.2. Safe Upgrade Strategies

Before upgrading, consider the potential impact on your application and data. Always follow a safe upgrade strategy:

1.  **Testing:**
    - Create a staging environment that mirrors your production environment.
    - Upgrade the PostgreSQL container in the staging environment.
    - Run thorough tests to ensure your application is compatible with the new version and that there are no performance regressions.

2.  **Backup:**
    - Before upgrading the production environment, create a full backup of your PostgreSQL database. This will allow you to rollback if necessary.

    ```bash
    docker exec -it postgres_db pg_dump -U your_db_user -d your_db_name > backup.sql
    ```

3.  **Upgrade Procedure:**
    - Stop the existing PostgreSQL container:

    ```bash
    docker stop postgres_db
    ```

    - Remove the existing container:

    ```bash
    docker rm postgres_db
    ```

    - Pull the latest `postgres:18` image:

    ```bash
    docker pull postgres:18
    ```

    - Create a new container with the updated image, using the same volume for data persistence:

    ```bash
    docker run -d \
      --name postgres_db \
      -v pgdata:/var/lib/postgresql/data \
      -p 5432:5432 \
      -e POSTGRES_USER=your_db_user \
      -e POSTGRES_PASSWORD=your_db_password \
      -e POSTGRES_DB=your_db_name \
      -e PGDATA=/var/lib/postgresql/data \
      postgres:18
    ```

4.  **Verification:**
    - After the upgrade, verify that the PostgreSQL version has been updated:

    ```bash
    docker exec -it postgres_db psql -U postgres -c "SELECT version();"
    ```

    - Run basic tests to ensure the database is functioning correctly.

### 11.3. Minimizing Downtime

To minimize downtime during the upgrade, consider using a primary/replica architecture. You can upgrade the replica instances first, then promote one of the replicas to be the new primary.

### 11.4. Rollback Procedures

If you encounter issues after the upgrade, you can rollback to the previous version by:

1.  Stopping and removing the upgraded container.
2.  Recreating the container using the previous image version (if you tagged it).
3.  Restoring the database from the backup you created before the upgrade.

### 11.5. Ensuring Data Integrity

- Always create a backup before upgrading.
- Run thorough tests after upgrading to verify data integrity.
- Monitor the database for any signs of data corruption.

## 12. Verifying Data Migration and Application Functionality After Version Change

After changing the PostgreSQL version, it's crucial to verify that the data migration was successful and that the application is functioning correctly.

1.  **Data Migration Verification:**
    - **Check Data Integrity:** Run queries to verify that the data is intact and consistent. Compare the data in the new version with a backup of the old version.
    - **Check Data Types:** Ensure that the data types are compatible with the new version. Some data types might have changed in PostgreSQL 18.
    - **Check Constraints:** Verify that all constraints are still valid and that there are no constraint violations.

2.  **Application Functionality Verification:**
    - **Run Application Tests:** Run all application tests to ensure that the application is functioning correctly with the new PostgreSQL version.
    - **Check Application Logs:** Check the application logs for any errors or warnings.
    - **Monitor Application Performance:** Monitor the application performance to ensure that there are no performance regressions.

3.  **Compatibility with Homebrew PostgreSQL 17:**
    - If you have existing implementations that rely on a local PostgreSQL version 17 instance managed via Homebrew, ensure that the application can connect to both the Docker container and the local Homebrew instance.
    - Verify that the connection parameters (host, port, password, database name) are configured correctly for both environments.

This guide provides a comprehensive overview of how to use PostgreSQL with Docker. For more information, please refer to the official PostgreSQL and Docker documentation.
