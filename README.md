# 🏢 Enterprise HRMS Monorepo

A modern, high-performance Human Resource Management System (HRMS) built with **React (Vite)** on the frontend, **Node.js (Express)** on the backend, and **PostgreSQL (Railway)** for relational data persistence.

---

## 📁 Repository Structure

```text
c:\HRMS\
├── client/                 # React 18 + Vite Frontend Application
│   ├── src/                # Pages, Components, State Contexts & Utilities
│   ├── public/             # Static Assets & Icons
│   ├── .env.example        # Frontend Environment Template
│   ├── vite.config.js      # Vite Bundler Configuration
│   └── package.json        # Frontend Dependencies
│
├── server/                 # Node.js + Express Backend API
│   ├── src/                # Express Controllers, Routes, & DB Pool
│   ├── scripts/            # PostgreSQL Schemas, Importers & Verifiers
│   ├── .env.example        # Backend Environment Template
│   └── package.json        # Backend Dependencies
│
├── package.json            # Monorepo Workspace Configuration
├── .gitignore              # Monorepo Git Ignore Rules
└── README.md               # Monorepo Documentation
```

---

## 🚀 Quick Start Guide

### 1. Installation
Clone the repository and install all workspace dependencies:
```bash
npm run install:all
```

### 2. Configure Environment Variables

- **Backend:** Copy `server/.env.example` to `server/.env` and provide your Railway PostgreSQL URL:
  ```env
  DATABASE_URL=postgresql://user:password@host:port/database
  PORT=5000
  ```

- **Frontend:** Copy `client/.env.example` to `client/.env`:
  ```env
  VITE_API_URL=http://localhost:5000/api
  VITE_SOCKET_URL=http://localhost:5000
  ```

### 3. Running Development Servers

- **Start Backend API Server:**
  ```bash
  npm run dev:server
  # Backend runs at http://localhost:5000
  ```

- **Start Frontend Web App:**
  ```bash
  npm run dev:client
  # Frontend runs at http://localhost:5173
  ```

---

## 🗄️ Database Architecture (PostgreSQL on Railway)

The system manages 24 relational tables:
- **Core Entities:** `companies`, `company_domains`, `users`, `roles`, `environment_settings`
- **Attendance & Leave:** `attendance`, `leave_requests`, `paid_leaves`, `regularization_requests`
- **Project & Task Management:** `projects`, `project_members`, `tasks`, `task_reports`
- **Team Hub & Chat:** `channels`, `messages`, `dm_threads`, `direct_messages`
- **Operations & Reports:** `daily_reports`, `weekly_reports`, `payroll`, `assets`, `notifications`, `external_links`, `settings`

---

## 📊 Codebase Knowledge Graph (Graphify)

This repository includes architectural knowledge graphs powered by Graphify:
```bash
npm run graphify
```
Open `client/graphify-out/graph.html` or `server/graphify-out/graph.html` in your browser for interactive call-flow and dependency navigation.
