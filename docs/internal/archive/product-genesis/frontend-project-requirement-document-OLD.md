I am building a front-end Goal Tracking web application named Lakira using NextJS for the front-end I would like you to help generate the code for this project. Below are the detailed requirements and specifications: Full-stack development and currently building my first backend project, **Lakira**, using NextJS, TypeScript, ESModule.

## Context - Project:

### **Lakira – Track, Improve, Evolve**

Lakira is a **versatile tracking app** designed to help users **monitor, visualize, and improve** their progress in fitness, wellness, productivity, learning, or personal habits.

**Custom Metrics** – Track anything, from gym workouts and study hours to sleep quality and mindfulness sessions.

**Visual Analytics** – Interactive charts & insights for tracking trends.

**Goal-Oriented Tracking** – Set milestones, measure improvements.

**Minimalist Design** – Inspired by **Japanese precision and structured simplicity and Javanese calming and elegant**.

**Smart Reminders** – Stay accountable with nudges and progress summaries.

# Technology Stack

**FrontEnd:**

- TypeScript: Yes
- Framework: Next.js, React
- Routers: React Routers
- State Management: Jotai
- CSS: TailwindCSS
- API Calls & Data Fetching: Tanstack’s react-query
- Forms: React Hook Form
- Routing and Navigation: Built-in file-based routing

**Additional Tools:**

- HTTP Client: Axios
- Testing: React Testing Library, Cypress (frontend)
- Deployment: Vercel (frontend)

### **Features and Requirements**

1. **User Authentication:**
   - Registration and login with email and password.
   - Password hashing with bcrypt.
   - JWT-based authentication for protected routes.
2. **Dashboard:**
   - Display user's isTracked Metric.
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

## Pages Directory Structure

### **Pages and Navigation**

Keeping in mind industry standards, scalability, and maintainability, this structure aligns with your metric-based tracking system while following Next.js best practices.
Note: This is the base paging visualization, pages may be added during development and/or future business approach changes. Please be agile for further changes according to business needs and development strategy.

pages
├── dashboard/ # Main dashboard
│ ├── index.tsx # Overview page, include data visualization for each metric with displayOnDashboard === true
│
├── metrics/ # Metrics Management
│ ├── index.tsx # List of metrics (Create new metric through modal pop-up), pagination, sort, filter, search.
│ ├── [metricId]/ # Dynamic route for metric details
│ │ ├── index.tsx # Metric overview page, includes view associated metric-category, metric-log, metric-settings, and data visualization of log. Create, Edit, Update of metric and it's assossiation happened through pop-up modal. Date Range Filter, Granularity Buckets, Smart Aggregation Triggers.
│
├── categories/ # Categories Management
│ ├── index.tsx # List of categories (Create new category with modal pop-up)
│ ├── [categoryId]/ # Dynamic category routes, includes view associated Metrics. Edit of metri-category happened through pop-up modal
│
├── settings/ # Application & user settings
│ ├── index.tsx # General settings
│ ├── profile.tsx # Profile settings
│ ├── metrics.tsx # Metric-related settings
│
├── account/ # User Account Management
│ ├── profile.tsx # View and edit user profile
│ ├── change-password.tsx # Change password page
│ ├── logout.tsx # Logout page
│
├── auth/ # Authentication Pages
│ ├── login.tsx # Login page
│ ├── register.tsx # Register page
│ ├── forgot-password.tsx # Password recovery
│
├── \_app.tsx # Next.js main app file
├── \_document.tsx # Custom document file
├── index.tsx # Landing page (Redirect to dashboard if logged in)

### Explanation of the Structure\*\*

| **Directory/File** | **Purpose**                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| `dashboard/`       | The main dashboard for users                                                    |
| `metrics/`         | Handles everything related to metrics (list, creation, editing, logs, settings) |
| `categories/`      | Manages metric categories                                                       |
| `settings/`        | User and app-wide settings                                                      |
| `account/`         | Profile management, password updates, logout                                    |
| `auth/`            | Handles authentication-related pages (login, registration, password reset)      |
| `_app.tsx`         | Next.js global provider wrapper                                                 |
| `_document.tsx`    | Next.js document customization                                                  |
| `index.tsx`        | Redirects to dashboard or shows a landing page                                  |

### **Component Reusability**

To **keep pages clean**, move reusable UI components to a `components/` directory:
Note: This is the base component visualization, refactored components may be added during development and/or future business approach changes. Please be agile for further changes according to business needs and development strategy.

components
├── layout/ # Layout components
│ ├── Sidebar.tsx # Sidebar navigation
│ ├── Layout.tsx # Main Layout with integerated sidebar (used for authenticated users)
│
├── metrics/ # Metric-related components
│ ├── MetricCard.tsx # Individual metric UI for metric list page
│ ├── MetricForm.tsx # Create and edit form using pop-up modal
│
├── categories/ # Category-related components
│ ├── CategoryCard.tsx # Individual metric-category UI for metric-category list page
│ ├── CategoryForm.tsx # Create and edit form using pop-up modal
│
├── metric-logs/ # Metric-log-related components
│ ├── LogCard.tsx # Individual metric-log UI for recent-log and logs in metric details page
│ ├── LogForm.tsx # Create and edit form using pop-up modal
│
├── metric-settings/ # Metric-settings-related components
│ ├── MetricSettingsCard.tsx # Individual metric-settings UI in metric details page
│ ├── MetricSettingsForm.tsx # Create and edit form using pop-up modal
│
├── settings/ # Settings components
│ ├── ProfileForm.tsx
│ ├── AccountSettings.tsx
│
├── auth/ # Authentication UI
│ ├── LoginForm.tsx
│ ├── RegisterForm.tsx
│ ├── AuthHeader.tsx # Page header
│ ├── AuthFooter.tsx # Footer
│ ├── AuthLayout.tsx # Layout with AuthHeader and AuthFooter (used for authenticated users)
│
├── ui/ # Generic UI components
│ ├── Button.tsx
│ ├── Modal.tsx
│ ├── Tabs.tsx
│ ├── Graph.tsx # Graph for dashboard page and metric details page for log data aggregation
│ ├── SekeletonLoader.tsx
│ ├── MetricSortFilterModal.tsx # Sort and Filter by of metrics for metric list page
│ ├── LogDataFilterModal.tsx # Date Range Filter and Granularity Buckets for dashboard page and metric details page
│
├── forms/ # Reusable form components
│ ├── InputField.tsx
│ ├── SelectField.tsx

### **State Management**

- Use Jotai for global state (user, metrics, goals)
- Use React's `useState` for local component state

### **Authentication**

- Implement JWT authentication
- Protect routes on both frontend and backend

### **Testing**

- Frontend: Write component tests with React Testing Library and E2E tests with Cypress

### **Deployment**

- Deploy frontend to Vercel # DONT EXECUTE THIS, decision still on-hold for a private self-hosted VPS

### **Code Structure and Best Practices**

- Follow RESTful API conventions
- Use ESM syntax
- Ensure proper error handling and logging
- Write clean, maintainable code with comments where necessary

### **Additional Requirements**

- Include a README with setup instructions
- Ensure the application is accessible and responsive
- Optimize for performance (e.g., code splitting, lazy loading)
