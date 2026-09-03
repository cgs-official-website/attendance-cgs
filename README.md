<div align="center">

# 🏢 Carrezza Global Solutions — Enterprise HRMS Portal

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://attendance-cgs.vercel.app)
[![Railway PostgreSQL](https://img.shields.io/badge/Railway-PostgreSQL_16-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://railway.app)
[![React 19](https://img.shields.io/badge/React_19-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite_8-Bundler-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Node.js](https://img.shields.io/badge/Node.js-Express_Backend-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS_v4-Design-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)

<p align="center">
  <strong>A fullstack, high-availability Human Resource Management System engineered for enterprise workforce tracking, automated shift & attendance control, real-time collaboration, and payroll administration.</strong>
</p>

[Live Demo](https://attendance-cgs.vercel.app) • [API Architecture](#-backend-api--architecture) • [Database Design](#-database-schema--models) • [Getting Started](#-getting-started)

---

</div>

## 📌 Executive Overview

**Carrezza Global Solutions HRMS** is an enterprise-grade workspace management platform designed with a clean micro-monorepo architecture. It bridges real-time attendance tracking with geolocation verification, end-to-end leave lifecycle approvals, collaborative channel-based communication, project milestones, and statutory payroll calculation.

```
                      ┌────────────────────────────────────────┐
                      │    Client (React 19 + Vite + Tailwind)  │
                      │    Hosted on Vercel Edge Network       │
                      └──────────────────┬─────────────────────┘
                                         │ HTTPS / WSS API
                                         ▼
                      ┌────────────────────────────────────────┐
                      │    API Engine (Node.js + Express + WS)  │
                      │    Hosted on Railway Cloud             │
                      └──────────────────┬─────────────────────┘
                                         │ Connection Pool
                                         ▼
                      ┌────────────────────────────────────────┐
                      │    PostgreSQL 16 Relational Database   │
                      │    Multi-Tenant Architecture on Railway│
                      └────────────────────────────────────────┘
```

---

## ✨ Key Platform Features

### ⏱️ 1. Precision Attendance & Geofencing
- **One-Click Check-In / Check-Out**: Live GPS coordinate verification and device location binding.
- **Automated Working Hours & Shift Calculation**: Real-time duration trackers, half-day/full-day status resolution.
- **Regularization Lifecycle**: Instant request workflow with approval trails for missed punches.

### 👥 2. Role-Based Access Control (RBAC) & Multi-Tenancy
- **Super Admin Portal**: Global tenant provisioning, module activation toggles, and workspace freezing.
- **Company Admin Console**: Real-time live attendance board, staff directory, custom domain provisioning, and approval workflows.
- **Employee Portal**: Personalized leave balances, assigned task lists, asset records, and interactive payslip generators.

### 💬 3. Real-Time Team Hub
- **Channel Discussions & Direct Messaging**: General broadcast channels, private project threads, and unread indicator counters.
- **Client Chats & External Links**: Direct customer-collaboration chat gateways with tokenized access links.

### 💼 4. Project & Task Operations
- **Interactive Project Calendar & Milestones**: Gantt-style planning and multi-member team assignments.
- **Task Management & Timesheets**: Dynamic timer logs, task activity reports, and performance analytics.

### 💳 5. Payroll & Asset Governance
- **Statutory Indian Payroll**: Automated calculations for gross salary, paid leave deductions, allowances, and printable PDF payslips.
- **Hardware & Software Asset Tracking**: Serial number assignment, condition logging, and return history.

---

## 🏗️ Repository Architecture

```text
├── client/                     # Frontend Application (React 19 + Vite)
│   ├── src/
│   │   ├── components/         # Reusable Design System Components
│   │   ├── context/            # Auth, Theme, Permissions, & Toast Providers
│   │   ├── modules/            # Enterprise Environmental Setup Modules
│   │   ├── pages/              # Admin, SuperAdmin, Employee, & Auth Views
│   │   ├── utils/              # PDF Generators, Geolocation, & Formatters
│   │   ├── App.jsx             # Main Router & Role Protected Routes
│   │   └── firebase.js         # Unified PostgreSQL API Client Layer
│   ├── vercel.json             # Vercel Deployment Configuration
│   └── package.json            # Frontend Dependencies & Build Scripts
│
├── server/                     # Backend API Service (Node.js + Express)
│   ├── src/
│   │   ├── config/             # PostgreSQL Pool & Environment Configuration
│   │   ├── controllers/        # Auth, Attendance, Projects, Leaves & Payroll
│   │   ├── middlewares/        # JWT Authentication & Role Validators
│   │   ├── routes/             # RESTful API Endpoint Definitions
│   │   └── services/           # Nodemailer SMTP & Notification Dispatcher
│   ├── scripts/                # Database Schemas, Seeders & Verifiers
│   └── package.json            # Backend Dependencies
│
├── vercel.json                 # Monorepo Vercel Deployment Orchestration
├── railway.json                # Monorepo Railway Deployment Orchestration
└── package.json                # Root Monorepo Workspace Configuration
```

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, Vite 8 | Ultra-fast client application with instant HMR |
| **UI & Styling** | Tailwind CSS v4, Lucide Icons | Responsive modern enterprise aesthetic |
| **Backend Runtime** | Node.js (ES Modules), Express.js | High-throughput REST & WebSocket API engine |
| **Database** | PostgreSQL 16 (`pg` pool) | Relational multi-tenant schema hosted on Railway |
| **Authentication** | JWT & Bcrypt | Stateless token-based auth with salted password hashing |
| **Communication** | Nodemailer (Gmail SMTP), Socket.io | Transactional password reset & real-time messaging |
| **Deployment** | Vercel (Client) + Railway (Server & DB) | Automated CI/CD pipeline from `main` branch |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **PostgreSQL**: Local instance or Railway connection URL
- **npm**: `v10.x+`

### 1. Installation
Clone the monorepo and install all workspace dependencies:
```bash
git clone https://github.com/cgs-official-website/attendance-cgs.git
cd attendance-cgs
npm install
```

### 2. Configure Environment Variables

#### Backend Configuration (`server/.env`)
```env
PORT=5005
DATABASE_URL=postgresql://postgres:password@host:port/railway
JWT_SECRET=your_jwt_super_secret_key
NODE_ENV=development

# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM="Zuna HRMS" <your-email@gmail.com>
APP_URL=http://localhost:5173
```

#### Frontend Configuration (`client/.env`)
```env
VITE_API_URL=http://localhost:5005/api
VITE_SOCKET_URL=http://localhost:5005
```

### 3. Start Development Servers

```bash
# Start backend API (Port 5005)
npm run dev:server

# Start frontend application (Port 5173)
npm run dev:client
```

---

## 🔒 Security & Best Practices

- **Sanitized Password Security**: Pure bcrypt salt hashing with zero plaintext credential exposure.
- **Time-Limited Reset Tokens**: Cryptographically signed 30-minute expiration JWT tokens for password resets.
- **SQL Injection Prevention**: 100% parameterized queries across all database controllers.
- **CORS & Environment Isolation**: Strict domain whitelisting and production origin validation.

---

## 📄 License & Attribution

Distributed under the **Commercial License** for Carrezza Global Solutions. All rights reserved.

<div align="center">
  <sub>Built with precision for <strong>Carrezza Global Solutions</strong></sub>
</div>
