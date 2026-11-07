# Lakira Backend – Jenkins Notes (Optional / Experimental)

## 1. Purpose & Scope

Jenkins is **not** the primary CI/CD solution for Lakira. The main pipeline is implemented with **GitHub Actions**.

This document exists to:

- Capture a **lightweight Jenkins setup** for learning and portfolio purposes.
- Show how a Jenkins pipeline can mirror the GitHub Actions pipeline.
- Provide a reference if a small **self-hosted Jenkins** instance is used temporarily on a VPS.

> Important: For long-term maintainability and cost, prefer **managed PaaS + GitHub Actions**. Treat Jenkins as an **optional experiment**, not the core path.

---

## 2. High-Level Architecture

If used, a basic Jenkins setup for Lakira Backend would look like:

- Jenkins server:
  - Running on a small VPS (e.g. 1 vCPU, 1–2 GB RAM).
  - Installed via Docker or OS packages.
- Jenkins pipeline:
  - Defined in a `Jenkinsfile` at repo root.
  - Triggered by GitHub webhook or periodic polling.
- Pipeline stages:
  - Checkout
  - Install dependencies
  - Lint & Typecheck
  - Unit & Integration tests
  - (Optional) Contract tests (local)
  - (Optional) Build & Deploy to staging

> Special Note for Codex: If asked to generate a `Jenkinsfile`, use the stages and commands from `GITHUB_ACTIONS_PIPELINE_PLAN.md` to keep behaviour consistent.

---

## 3. Minimal Jenkinsfile Sketch

A **simplified** pipeline mirroring the basic CI flow (without staging deploy) might look like:

```groovy
pipeline {
  agent any

  environment {
    NODE_ENV = 'test'
    NODE_VERSION = '20'
    // Use Jenkins credentials for secrets
    JWT_SECRET = credentials('lakira-jwt-secret-test')
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Setup Node') {
      steps {
        sh 'node -v || nvm install ${NODE_VERSION} || true'
        // In a more advanced setup, use a Jenkins NodeJS plugin
      }
    }

    stage('Install Dependencies') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Lint & Typecheck') {
      steps {
        sh 'npm run lint'
        sh 'npm run typecheck'
      }
    }

    stage('Unit & Integration Tests') {
      steps {
        // Assumes Postgres/Redis are available (e.g. Docker compose or Jenkins agents)
        sh 'npm run db:migrate:test'
        sh 'npm run test:unit'
        sh 'npm run test:integration'
      }
    }

    // Optional: Contract Tests (Local)
    stage('Contract Tests (Local)') {
      when {
        expression { return false } // Enable when environment is ready
      }
      steps {
        sh 'npm run start:test &'
        sh 'sleep 15'
        sh 'npm run test:contract:local'
      }
    }
  }

  post {
    always {
      junit 'reports/**/*.xml' // If you produce Jest/Newman JUnit reports
      archiveArtifacts artifacts: 'reports/**/*', fingerprint: true
    }
    failure {
      echo 'Build failed. Check test reports and logs.'
    }
  }
}
```
