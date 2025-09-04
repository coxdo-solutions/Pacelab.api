# 📚 PaceLab LMS API

> Backend API for the **PaceLab Learning Management System (LMS)**  
> Built with [NestJS](https://nestjs.com), [Prisma](https://www.prisma.io/), [PostgreSQL](https://www.postgresql.org/), and [Redis](https://redis.io/).  
> Deployable on [Render](https://render.com), connected to Supabase Postgres + Upstash Redis.

---

## 🚀 Features

- **Authentication & Authorization**
  - JWT-based auth with refresh token support
  - Secure cookie/session handling

- **User & Role Management**
  - Roles (`Admin`, `Instructor`, `Student`)
  - Status management (`Active`, `Inactive`)

- **Course & Content**
  - Courses, modules, lessons
  - Lesson progress & enrollment tracking

- **Chat & Messaging**
  - Real-time private messaging between users
  - Redis-backed session caching

- **YouTube Integration**
  - Search & fetch videos/playlists
  - Upload lessons directly to YouTube via OAuth 2.0

- **Admin Panel Support**
  - Usage stats, monitoring endpoints

- **Developer Experience**
  - Swagger docs (`/api/docs`)
  - Centralized validation (class-validator)
  - Helmet, compression, CORS policies
  - Prisma for DB schema management
  - Upstash Redis for lightweight caching

---

## 🏗️ Tech Stack

- **Framework**: [NestJS 10](https://docs.nestjs.com/)
- **ORM**: [Prisma 6](https://www.prisma.io/)
- **Database**: [PostgreSQL (Supabase)](https://supabase.com/)
- **Cache**: [Upstash Redis](https://upstash.com/)
- **Auth**: JWT + Passport.js
- **Deployment**: Render (Node 20 runtime)
- **Docs**: Swagger (OpenAPI)
