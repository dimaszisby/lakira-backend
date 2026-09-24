I am building a back-end Goal Tracking web application named Lakira using **Node.js** for the backend. I would like you to help generate the code for this project. Below are the detailed requirements and specifications:

### **Lakira – Track, Improve, Evolve**

Lakira is a **versatile tracking app** designed to help users **monitor, visualize, and improve** their progress in fitness, wellness, productivity, learning, or personal habits.

**Custom Metrics** – Track anything, from gym workouts and study hours to sleep quality and mindfulness sessions.

**Visual Analytics** – Interactive charts & insights for tracking trends.

**Goal-Oriented Tracking** – Set milestones, measure improvements.

**Minimalist Design** – Inspired by **Japanese precision and structured simplicity and Javanese calming and elegant**.

**Smart Reminders** – Stay accountable with nudges and progress summaries.

# Technology Stack

**Backend:**

- Runtime: NodeJS
- Framework: Express.js
- Database: PostgreSQL
- API Method: Rest
- Authentication: JWT (JSON Web Tokens)
- ORM: Sequelize

**Additional Tools:**

- Testing: Jest, Supertest (backend)
- Deployment: Heroku (backend) # DONT EXECUTE THIS, decision still on-hold for a private self-hosted VPS

### **Features and Requirements**

1. **User Authentication:**
   - Registration and login with email and password.
   - Password hashing with bcrypt.
   - JWT-based authentication for protected routes.
2. **Dashboard:**
   - Display user's Metric with isShownOndashboard == true.
   - Charts showing trends over time using Chart.js for each Metric.
3. **Libraries of Metric and Metric Category.**
   - Buttons to show a form to create Metric or Metric Category.
   - Pages contains list of Metric or Metric Category collections.
   - Enable user to access detail view where he could read, update, and delete items.
4. **Logging Metrics:**
   - Forms to log Metric.
   - Input validation and error handling.
5. **Metric Settings:**
   - Users can set, update, and delete personal goals through MetricSettings.
   - Users can access historical goals.
6. **Responsive Design:**
   - Ensure the app compatible with various browser window sizes.

### **API Specifications**

- **Authentication Endpoints:**
  - `POST /api/v1/auth/register`: Register a new user
  - `POST /api/v1/auth/login`: Login user and return JWT
  - `GET /api/v1/auth/profile`: Get authenticated user's profile
  - `PUT /api/v1/auth/profile`: Update authenticated user's profile
  - `POST /api/v1/auth/logout`: Logout user
- **Metrics Endpoints:**
  - `GET /api/v1/metrics`: Get all metrics for authenticated user (with pagination, filtering)
  - `GET /api/v1/metrics/:id`: Get a specific metric
  - `POST /api/v1/metrics`: Add a new metric
  - `PUT /api/v1/metrics/:id`: Update a metric
  - `DELETE /api/v1/metrics/:id`: Delete a metric
- **MetricSettings Endpoints:**
  - `GET /api/v1/metrics/:metricId/settings`: Get all settings for a specific metric
  - `POST /api/v1/metrics/:metricId/settings`: Add new settings to a metric
  - `PATCH /api/v1/metrics/:metricId/settings/:id`: Update a metric setting
  - `DELETE /api/v1/metrics/:metricId/settings/:id`: Delete a metric setting
- **MetricCategory Endpoints:**
  - `GET /api/v1/categories`: Get all metric categories for authenticated user
  - `GET /api/v1/categories/:id`: Get a specific category
  - `POST /api/v1/categories`: Add a new metric category
  - `PUT /api/v1/categories/:id`: Update a metric category
  - `DELETE /api/v1/categories/:id`: Delete a metric category
- **MetricLog Endpoints:**
  - `GET /api/v1/metrics/:metricId/logs`: Get all logs for a specific metric
  - `GET /api/v1/metrics/:metricId/logs/:id`: Get a specific log entry
  - `POST /api/v1/metrics/:metricId/logs`: Add a new metric log
  - `PUT /api/v1/metrics/:metricId/logs/:id`: Update a metric log
  - `DELETE /api/v1/metrics/:metricId/logs/:id`: Delete a metric log
- **Trends Endpoints:**
  - `GET /api/v1/metrics/:metricId/trends`: Get trend data for a specific metric

### **Database Schema**

- **User:**
  - `id`: UUID, required, unique
  - `username`: String, required, unique
  - `email`: String, required, unique, validate: { isEmail: true }
  - `password`: String, required
  - `role`: ENUM("user", "admin") default "user"
  - `isPublicProfile`: Bool, required, default ‘true’
  - `createdAt`: Date
  - `updatedAt`: Date
  - `deletedAt`: Date
- **Metric:**
  - `id`: UUID
  - `userId`: UUID, references User (cascade, can’t exist without User)
  - `categoryId`: UUID, reference MetricCategory (nullify, do exists without MetricCategory)
  - `originalMetricId`: UUID, reference Metric (adopted from other user, nullify do exist if adopted Metric is deleted)
  - `name`: String (e.g., 'steps', 'hydration')
  - `description`: String
  - `defaultUnit`: String
  - `isPublic`: Boolean (default ‘true’)
  - `createdAt`: Date
  - `updatedAt`: Date
  - `deletedAt`: Date
- **MetricSettings:**
  - `id`: UUID
  - `metricId`: UUID, references Metric (cascade, can’t exists without Metric)
  - `goalEnabled`: Boolean (default ‘false’)
  - `goalType`: ENUM("cumulative", "incremental")
  - `goalValue`: Number
  - `timeFrameEnabled`: Boolean (default ‘false’)
  - `startDate`: Date
  - `deadlineDate`: Date
  - `alertEnabled`: Boolean (default ‘false’)
  - `alertThresholds`: Number (default 80)
  - `isAchieved`: Boolean (default ‘false’)
  - `isActive`: Boolean (default ‘true’)
  - `displayOptions`: JSONB (default { showOnDashboard: true, priority: 1, chartType: "line", color: "#E897A3" })
  - `createdAt`: Date
  - `updatedAt`: Date
- **MetricLog:**
  - `id`: UUID
  - `metricId`: UUID, references Metric (cascade, can’t exists without Metric)
  - `type`: ENUM("manual", "automatic") default "manual"
  - `logValue`: Number
  - `loggedAt`: Date
  - `createdAt`: Date
  - `updatedAt`: Date
- **MetricCategory**:
  - `id`: UUID
  - `userId`: UUID, references User (cascade, can’t exists without User)
  - `name`: String, required
  - `color`: String (hex, default to ‘E897A3’)
  - `icon`: String (emoji, default to '📁')
  - `deletedAt`: Date
  - `createdAt`: Date
  - `updatedAt`: Date

**ENUM Definitions**

1. **enum_users_role**: `user`, `admin`
2. **enum_metric_settings_goal_type**: `cumulative`, `incremental`
3. **enum_metric_log_type**: `manual`, `automatic`

### **Data Visualization Plan**

1. **Display Scope**
   - **Dashboard Page**
     - Visualizes only metrics where `showOnDashboard === true`.
   - **Metric Detail Page**
     - Displays:
       - Metric metadata
       - Aggregated stats (charts)
       - Log history
       - Metric settings
2. **Improvement Plan**
   1. **Date Range Filter**

      Allow users to choose `7-day`, `30-day`, or custom ranges.

   2. **Granularity Buckets**

      Support `daily`, `weekly`, `monthly` aggregation.

   3. **Smart Aggregation Triggers**

      Recompute stats when logs are created, updated, or deleted.

   4. **Cached Buckets (Redis)**

      Store visual data in Redis like `dailyStats:{userId}:{metricId}:{YYYY-MM-DD}` to reduce query load.

   5. **Visual Query Endpoint**

      `/metrics/:id/logs/visualization?start=...&end=...&bucket=...`

   6. **Downsampling for Large Visual Sets**

      Compress or sample raw logs for frontend rendering when dataset is large.

3. Development Strategy
   - Flexible DTO pattern with `startDate`, `endDate`, `bucketSize`, etc.
   - Visual aggregation services will be reusable and composable.
   - Optimize by checking and serving cached stats first before DB fallback.

### **Authentication**

- Implement JWT authentication
- Protect routes on backend

### **Testing**

- Backend: Write unit and integration tests with Jest and Supertest

### **Deployment**

- Deploy backend to Heroku # DONT EXECUTE THIS, decision still on-hold for a private self-hosted VPS

### **Code Structure and Best Practices**

- Follow RESTful API conventions
- Use ES6+ syntax
- Ensure proper error handling and logging
- Write clean, maintainable code with comments where necessary

### **Additional Requirements**

- Include a README with setup instructions
- Ensure the application is accessible and responsive
- Optimize for performance (e.g., code splitting, lazy loading)
