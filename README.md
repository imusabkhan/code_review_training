# Code Review Challenge Platform

> **Developed by:** Musab Khan ([imusabkhan](https://github.com/imusabkhan)) & Shaz Syed ([shazsyed](https://github.com/shazsyed))  
>  
> **Purpose:** Internal security training and code review practice  
>  
> **⚠️  Note:** This application is designed for educational purposes and is not intended for production environments.

A web-based platform for code review training challenges with real-time user tracking and leaderboard functionality.

## Screenshots

### Main Interface
![Main Interface](docs/main-interface.png)

### Admin Panel
![Admin Panel](docs/admin-panel.png)

### Leaderboard
![Leaderboard](docs/leaderboard.png)

## Quick Start with Docker

Requires a Postgres database (e.g. a free [Neon](https://neon.tech) project) — you need BOTH its
pooled connection string (`DATABASE_URL`, used at runtime) and its direct connection string
(`DIRECT_URL`, used only by the migration step the container runs on startup). On Neon, `DIRECT_URL`
is the same host as `DATABASE_URL` with `-pooler` removed. **Set your own `ADMIN_PASSWORD` and
`ADMIN_SESSION_SECRET` before running a real session** — the app falls back to public, documented
defaults if you don't.

### Option 1: Pull from Docker Hub
```bash
docker pull imusabkhan/code-review-training:latest
docker run -d --name code_review_training -p 3000:3000 -p 4001:4001 \
  -e DATABASE_URL="postgresql://user:password@host-pooler/dbname?sslmode=require&connect_timeout=15&pgbouncer=true" \
  -e DIRECT_URL="postgresql://user:password@host/dbname?sslmode=require&connect_timeout=15" \
  -e ADMIN_PASSWORD="choose-a-real-password" \
  -e ADMIN_SESSION_SECRET="choose-a-random-32+-char-string" \
  imusabkhan/code-review-training:latest
```

### Option 2: Build and Run Locally
```bash
# Build the image
docker build -t code-review-training .

# Run the container
docker run -d --name code_review_training -p 3000:3000 -p 4001:4001 \
  -e DATABASE_URL="postgresql://user:password@host-pooler/dbname?sslmode=require&connect_timeout=15&pgbouncer=true" \
  -e DIRECT_URL="postgresql://user:password@host/dbname?sslmode=require&connect_timeout=15" \
  -e ADMIN_PASSWORD="choose-a-real-password" \
  -e ADMIN_SESSION_SECRET="choose-a-random-32+-char-string" \
  code-review-training
```

### Access the Application
- **Main App**: http://localhost:3000
- **Socket.IO Server**: http://localhost:4001

## Local Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Git
- A Postgres database — a free [Neon](https://neon.tech) project takes a minute to create and gives
  you a ready-to-use connection string

### Installation
```bash
# Clone the repository
git clone https://github.com/imusabkhan/code_review_training.git
cd code_review_training

# Install dependencies
npm install

# Create your environment file from the template, then fill in your own
# DATABASE_URL (from Neon/Supabase/etc.), ADMIN_PASSWORD, and ADMIN_SESSION_SECRET
cp .env.local.example .env.local

# Generate the Prisma client and apply migrations
npx prisma generate
npx prisma migrate deploy

# Load the built-in challenges into the database
npm run db:seed

# Start development server
npm run dev
```

Challenges live in the database (`Challenge` table), not in source code — `prisma/seed.ts` is only the
starting set. Add/edit/delete challenges through the admin dashboard (`/admin`), which is the only
way changes persist; there is no `src/data/challenges.ts` anymore.

## Features

- **Code Review Challenges**: Interactive challenges with vulnerability detection
- **Real-time User Tracking**: Live user count and challenge timers
- **Leaderboard System**: Track user scores and rankings
- **Admin Panel**: Manage challenges and monitor submissions
- **Flag Submission**: Secure flag validation system

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM, PostgreSQL
- **Real-time**: Socket.IO
- **Authentication**: Iron Session (admin)
- **Styling**: Radix UI components





## Docker Commands

```bash
# Build image
docker build -t code-review-training .

# Run container (see Quick Start above for required -e flags)
docker run -d --name code_review_training -p 3000:3000 -p 4001:4001 \
  -e DATABASE_URL="..." -e DIRECT_URL="..." -e ADMIN_PASSWORD="..." -e ADMIN_SESSION_SECRET="..." \
  code-review-training

# View logs
docker logs code_review_training

# Stop container
docker stop code_review_training

# Remove container
docker rm code_review_training
```

## Admin Access

- **URL**: http://localhost:3000/admin
- **Password**: `admin123` by default — **set your own via the `ADMIN_PASSWORD` env var before running
  a real session.** The default is public in this README; anyone who reads it can log in as admin.

## License

MIT License
