# MUMS - MUMS User Management System

> **Enterprise-grade user management platform with real-time collaboration, advanced scheduling, and role-based access control**

[![Build](https://img.shields.io/badge/Build-Phase%201--516-blue)](https://github.com/maceryanarmarillereyes-lgtm/newmace)
[![Node](https://img.shields.io/badge/Node-20.x-green)](https://nodejs.org)
[![Deployment](https://img.shields.io/badge/Deploy-Vercel-black)](https://vercel.com)
[![Database](https://img.shields.io/badge/DB-Supabase-green)](https://supabase.com)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [Installation](#installation)
- [Deployment](#deployment)
- [API Endpoints](#api-endpoints)
- [Development](#development)
- [Testing](#testing)
- [Security](#security)
- [Code Protections](#code-protections)
- [Contributing](#contributing)

---

## 🎯 Overview

**MUMS (MUMS User Management System)** is a production-ready, enterprise-grade web application designed for managing users, schedules, and real-time collaboration workflows. Built with a JAMstack architecture, MUMS combines static frontend delivery with serverless API routes and a PostgreSQL backend powered by Supabase.

### Key Highlights

- **Real-time Collaboration:** Live presence tracking, cross-tab sync, and instant updates
- **Advanced Scheduling:** Team schedule builder with drag-and-drop, task balancing, and graphical analytics
- **Role-Based Access Control (RBAC):** 4-tier permission system (Super Admin, Admin, Team Lead, Member)
- **Enterprise UI/UX:** Glassmorphism theme engine, custom cursor, world clocks, and accessibility-first design
- **Mobile-First:** Fully responsive with dedicated mobile layout
- **Audit Trail:** Complete activity logging for compliance and debugging

---

## 🏗️ Architecture

### High-Level Design

┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND (Static HTML/CSS/JS) │
│ ├─ index.html (43KB SPA) │
│ ├─ Vanilla JavaScript (no framework dependencies) │
│ ├─ Glassmorphism UI with theme engine │
│ └─ Real-time sync via Supabase Realtime │
└─────────────────────────────────────────────────────────────────┘
↓
┌─────────────────────────────────────────────────────────────────┐
│ VERCEL SERVERLESS API (Node.js 20.x) │
│ ├─ /api/users/create (User CRUD) │
│ ├─ /api/presence/* (Presence tracking) │
│ ├─ /api/mailbox_override/* (Time override) │
│ ├─ /api/keep_alive (Supabase heartbeat) │
│ └─ /api/vendor/supabase.js (Self-hosted SDK) │
└─────────────────────────────────────────────────────────────────┘
↓
┌─────────────────────────────────────────────────────────────────┐
│ SUPABASE (PostgreSQL + Realtime + Auth + Storage) │
│ ├─ Auth: JWT-based with role enforcement │
│ ├─ Database: PostgreSQL with RLS policies │
│ ├─ Realtime: WebSocket-based live updates │
│ └─ Storage: Profile photos (public bucket) │
└─────────────────────────────────────────────────────────────────┘

text

### Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Frontend** | Vanilla JS | Zero framework overhead, maximum performance |
| **Backend** | Node.js 20.x | Native ESM support, stable LTS |
| **Database** | Supabase (PostgreSQL) | Real-time capabilities, RLS, managed hosting |
| **Deployment** | Vercel | Edge network, instant rollbacks, zero-config |
| **Auth** | Supabase Auth | JWT-based, OAuth support, admin API |
| **Storage** | Supabase Storage | CDN-backed, RLS integration |

---

## ⚡ Core Features

### 1. Authentication & Authorization

- **Supabase Auth Integration:** JWT-based authentication with automatic token refresh
- **4-Tier RBAC:** `SUPER_ADMIN`, `ADMIN`, `TEAM_LEAD`, `MEMBER`
- **Session Management:** Auto-refresh on sleep/wake, expired token recovery
- **Real-Time Logout:** Deleted users are immediately logged out across all sessions

### 2. User Management

- **Full CRUD Operations:** Create, read, update, delete with role-based permissions
- **Profile System:** 
  - Server-side photo upload with crop tool
  - Custom display layouts (banner, card, split, minimal)
  - Real-time sync across all sessions
- **Duplicate Suppression:** Prevents repeated user creation
- **Rate Limit Handling:** 429 cooldown with countdown UI

### 3. Real-Time Collaboration

- **Presence Tracking:** Live online/offline status via `mums_presence` table
- **Cross-Tab Sync:** Changes propagate via `storage` events
- **Keep-Alive System:** Prevents Supabase project pause (48h heartbeat)
- **Sync Status Indicator:** Visual connection status in top bar

### 4. Mailbox System

- **Case Assignment Workflow:** Assign cases to team members
- **Mailbox Manager Duty:** Schedule-based assignment permissions
- **Time Override System (Super Admin):**
  - Freeze time for testing
  - Scope: `sa_only` or `global`
  - Audit logging to `mums_sync_log`
- **Real-Time Updates:** All users see changes instantly

### 5. Schedule Management

**Team Schedule Builder (Team Lead/Admin)**
- Drag-and-drop task assignment
- 4 task types: Mailbox Manager, Back Office, Call Available, Lunch
- Lock/unlock system for immutable blocks
- Graphical Task Status panel with balancing analytics
- Real-time progress bars with governance notices:
  - Green: 0–60% utilization
  - Orange: 61–85% utilization
  - Red: 86–100% utilization

**Member Schedule Viewer**
- 3 view modes: Weekly, Daily, Team
- Timezone conversion with GMT offsets
- Color-coded task visualization
- Mobile-optimized touch interactions

### 6. Enterprise UI/UX

**Theme Engine**
- Glassmorphism design system
- Multiple preset themes
- WCAG contrast validation
- Dark/light mode support

**Customization**
- Custom cursor (toggle OS cursor)
- World clocks with alarm system
- Quick links bar (10 customizable shortcuts)
- Notification sound settings (beep/chime/pop + volume)

**Accessibility**
- Full ARIA labels
- Keyboard navigation
- Focus management
- Screen reader support

**Guide System**
- Contextual help panels
- Search functionality
- Markdown-based content
- Per-page manual sections

**Tools**
- Dictionary (feature glossary)
- Release Notes (Markdown editor + import/export)
- System Diagnostics (auto-fix tool)
- Data Tools (localStorage export/import)

### 7. Activity & Audit

- **Sidebar Activity Logs:** Recent actions with "View All" history
- **Audit Trail:** Complete logging to `mums_sync_log`
- **Dashboard Metrics:** Real-time stats and heatmap
- **Notification Center:** Unread counts with acknowledge actions

---

## 🛠️ Tech Stack

### Frontend
- **HTML5:** Semantic markup with accessibility
- **CSS3:** Custom properties, grid, flexbox, glassmorphism
- **JavaScript (ES6+):** Modular architecture, no framework

### Backend
- **Runtime:** Node.js 20.x (Vercel Serverless Functions)
- **API Design:** RESTful with JWT authentication
- **Max Duration:** 10s per function

### Database
- **Provider:** Supabase (managed PostgreSQL)
- **Features:** Row-Level Security (RLS), real-time subscriptions, full-text search
- **Tables:** 8 core tables (profiles, documents, presence, sync_log, schedule, etc.)

### Storage
- **Provider:** Supabase Storage
- **Bucket:** `public` (profile photos)
- **Path Convention:** `avatars/<user_uuid>/<timestamp>_<random>.<ext>`

### DevOps
- **CI/CD:** Vercel (automatic deploys on push)
- **Testing:** Playwright (E2E tests)
- **Monitoring:** Supabase Dashboard + Vercel Analytics

---

## 🗂️ Database Schema

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `mums_profiles` | User profiles with RLS | `user_id`, `email`, `role`, `team`, `photo_url` |
| `mums_documents` | File attachments | `id`, `user_id`, `file_url`, `created_at` |
| `mums_presence` | Online status tracking | `user_id`, `status`, `last_seen` |
| `mums_sync_log` | Audit trail | `user_id`, `action`, `scope`, `timestamp` |
| `mums_mailbox_time_override` | Time override state | `scope`, `enabled`, `effective_time`, `freeze` |
| `mums_schedule_blocks` | Task assignments | `user_id`, `task_type`, `start_time`, `end_time`, `locked` |
| `mums_schedule_snapshots` | Schedule history | `snapshot_data`, `created_at` |
| `heartbeat` | Keep-alive pings | `uid`, `timestamp` |

### RLS Policies

- **profiles_select_own:** Users can read their own profile
- **heartbeat RLS:** Users can only access their own heartbeat rows

---

## 📦 Installation

### Prerequisites

- Node.js 20.x or later
- Supabase account (free tier supported)
- Vercel account (optional for deployment)

### 1. Clone Repository

```bash
git clone https://github.com/maceryanarmarillereyes-lgtm/newmace.git
cd newmace
2. Install Dependencies
bash
npm install
3. Supabase Setup
Create a Supabase project at supabase.com

Run database migrations:

sql
-- In Supabase SQL Editor, run in order:
-- 1. Base schema
\i supabase/schema.sql

-- 2. Schema updates
\i supabase/schema_update_v2.sql

-- 3. All migrations (recommended)
\i supabase/RUN_ALL_MIGRATIONS.sql
Verify tables exist:

mums_profiles

mums_documents

mums_presence

mums_sync_log

mums_mailbox_time_override

mums_schedule_blocks

mums_schedule_snapshots

heartbeat

Create storage bucket:

Go to Supabase Dashboard → Storage → Buckets

Create new bucket: public (or your preferred name)

Set access: Public

4. Environment Variables
Copy .env.example to .env and configure:

bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Server-side only
SUPABASE_PUBLIC_BUCKET=public

# App
NODE_ENV=development
⚠️ SECURITY: Never commit .env to version control. The service role key must only be used server-side.

5. Local Development
bash
# Start local server
python -m http.server 8080

# Open browser
open http://localhost:8080/login.html
Optional: Local Realtime Relay

bash
cd realtime
npm install
npm start
The webapp will automatically use ws://localhost:17601 when running on localhost.

🚀 Deployment
Vercel (Recommended)
Push to GitHub (if not already done)

Import in Vercel:

Go to vercel.com

Import repository: maceryanarmarillereyes-lgtm/newmace

Configure Environment Variables:

Go to Project Settings → Environment Variables

Add all variables from .env.example

Deploy:

Vercel will auto-deploy on push to main branch

Custom domains supported

Cloudflare Pages (Alternative)
Connect repository in Cloudflare Pages dashboard

Build settings:

Build command: npm run build

Output directory: . (root)

Add environment variables

Deploy

🔌 API Endpoints
Authentication Required
All endpoints except /api/env require JWT authentication via Authorization: Bearer <token> header.

Endpoints
Endpoint	Method	Role	Purpose
/api/env	GET	Public	Runtime config
/api/users/create	POST	SUPER_ADMIN, TEAM_LEAD	Create user
/api/presence/*	POST	Authenticated	Update presence
/api/mailbox_override/get	GET	Authenticated	Get time override
/api/mailbox_override/set	POST	SUPER_ADMIN	Set time override
/api/keep_alive	POST	Service	Supabase heartbeat
/api/vendor/supabase.js	GET	Public	Supabase SDK
Rate Limiting
Supabase Auth Admin API: Can return HTTP 429 (rate limit exceeded)

Backend Behavior: Propagates Retry-After header or applies fallback backoff

Frontend UX: Disables Save button during cooldown with countdown timer

🧪 Development
File Structure
text
newmace/
├── api/                     # Vercel serverless functions
│   ├── env.js              # Environment config endpoint
│   └── handler.js          # Main API router
├── css/                     # Stylesheets
│   ├── styles.css          # Core styles
│   ├── mailbox.css         # Mailbox-specific
│   └── enterprise_ux.css   # Glassmorphism theme
├── public/                  # Static assets (JS modules)
├── scripts/                 # Build + QA automation
│   ├── test-env.js         # Environment validator
│   └── qa-deploy.sh        # QA deployment script
├── supabase/                # Database migrations
│   ├── schema.sql          # Base schema
│   ├── schema_update_v2.sql
│   └── migrations/         # Incremental patches
├── tests/                   # Playwright E2E tests
├── tools/                   # Release packager
│   └── package_phase1_release.js
├── index.html               # Main SPA (43KB)
├── login.html               # Login page
├── vercel.json              # Deployment config (LOCKED)
├── package.json             # Node 20.x + Playwright
└── CODE_UNTOUCHABLES.md     # Protected code rules
NPM Scripts
bash
# Build (no-op for static site)
npm run build

# Environment test
npm run test:env

# Login E2E test
npm run test:login

# Package release (Phase 1)
npm run package:phase1

# QA deployment
npm run qa:deploy
Coding Standards
No framework dependencies (vanilla JS only)

Modular architecture (feature-based file organization)

ES6+ syntax (modern JavaScript)

Accessibility-first (ARIA labels, keyboard nav)

Mobile-first (responsive design)

🧪 Testing
Playwright E2E Tests
bash
# Install Playwright
npm install

# Run login test
npm run test:login

# Run all tests
npx playwright test

# Run with UI
npx playwright test --ui

# Generate report
npx playwright show-report
Manual Testing Checklist
 Login/logout flow

 User creation (TEAM_LEAD/SUPER_ADMIN)

 Profile photo upload

 Real-time presence sync

 Schedule drag-and-drop

 Mailbox case assignment

 Theme switching

 Mobile layout

 Cross-tab sync

 Session expiry recovery

🔒 Security
Authentication
JWT-based: Supabase Auth with automatic token refresh

Secure storage: Tokens stored in httpOnly cookies (where supported)

Session expiry: Auto-refresh on resume, forced logout on deletion

Authorization
RBAC enforcement: Role checks on both frontend and backend

RLS policies: Database-level access control

Service role isolation: Service role key only used server-side (Vercel functions)

Data Protection
RLS (Row-Level Security): Users can only access their own data

Audit logging: All sensitive actions logged to mums_sync_log

HTTPS only: Enforced via Vercel deployment

Best Practices
✅ Never expose SUPABASE_SERVICE_ROLE_KEY in client code

✅ Always validate JWT tokens server-side

✅ Use RLS policies for multi-tenant isolation

✅ Sanitize user inputs (XSS prevention)

✅ Rate limit sensitive endpoints

🛡️ Code Protections
This repository includes permanent safeguards documented in CODE_UNTOUCHABLES.md.

Critical Rules
vercel.json lock: Must remain in v4.2 format (no runtime overrides)

User creation safeguards: Duplicate suppression + cooldown logic

Mailbox override rules: Visibility + audit + anti-recursion guards

RLS policies: profiles_select_own must not be removed

Dashboard routing: No auto-redirect to Mailbox

Mobile layout parity: All features must remain accessible

JWT expiry recovery: Silent refresh on resume

Schedule alignment: Ruler + grid pixel-perfect sync

Keep-alive governance: 48h heartbeat requirement

Build versioning: p1-<SEQ> cache busting format

Conditional Exceptions
Protected code may only be changed if required by:

Documented platform updates (Vercel, Supabase)

Explicit security requirements

Approved UX specification changes

📝 Contributing
Branching Strategy
main - Production-ready code

feature/* - New features

fix/* - Bug fixes

docs/* - Documentation updates

Pull Request Process
Create feature branch from main

Make changes with clear commit messages

Test locally (E2E + manual)

Submit PR with description

Wait for review + CI checks

Merge after approval

Commit Message Format
text
type(scope): subject

body (optional)

footer (optional)
Types: feat, fix, docs, style, refactor, test, chore

Example:

text
feat(schedule): add graphical task balancing panel

- Implements real-time progress bars
- Adds governance notices for hour thresholds
- Supports Mailbox Manager vs Call Available comparison

Closes #42
📄 License
This project is proprietary and confidential. Unauthorized copying or distribution is prohibited.

🤝 Support
Issues: GitHub Issues

Documentation: See _steps_readme/ directory

In-App Help: Use Dictionary and Release Notes features

🚀 Roadmap
Phase 1 (Current)
✅ Core user management

✅ Real-time collaboration

✅ Schedule builder

✅ Mailbox system

✅ Enterprise UI/UX

Phase 2 (Planned)
 Advanced reporting

 Mobile app (React Native)

 API v2 (GraphQL)

 Multi-language support

 Advanced analytics dashboard

🙏 Acknowledgments
Built with:

Supabase - Open source Firebase alternative

Vercel - Edge platform for frontend frameworks

Playwright - E2E testing framework