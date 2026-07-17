# OP Market Backend

A production-ready backend API for an ecommerce platform built with a modern Node.js stack.  
This project demonstrates real-world backend architecture including authentication, payments, media handling, and full test coverage (unit, integration, and e2e).

---

## Tech Stack

- Node.js + Express
- TypeScript
- PostgreSQL
- Prisma ORM
- JWT Authentication (access + refresh tokens in HttpOnly cookies)
- Zod for validation
- Cloudinary for image storage
- Brevo (Sendinblue) for transactional emails
- PayPal (Sandbox) for payments
- Vitest + Supertest for testing

---

## Features

### Authentication & Security

- User signup and login
- Email verification flow
- Password reset flow
- JWT-based authentication (cookies)
- Access & refresh token rotation
- Role-based access control (Admin/User)

### Users

- Profile update
- Address management
- Admin user management

### Products

- Full CRUD (Admin only)
- Image upload & deletion via Cloudinary
- Search with filtering
- Pagination support

### Cart

- Add/remove items
- Update quantity
- Per-user cart isolation

### Orders

- Create orders from cart
- Order history
- Order status tracking
- Admin order management

### Payments

- PayPal checkout (sandbox)
- Capture & retry payment
- Cash on Delivery fallback

---

## Testing

- Unit Tests
- Integration Tests
- E2E Tests

Run:

npm run test:unit  
npm run test:integration  
npm run test:e2e

---

## CI (Continuous Integration)

GitHub Actions runs on every push:

- Install dependencies
- Setup database
- Run lint + typecheck
- Run all tests

---

## Getting Started

### Install

npm install

### Setup env

Create .env file and add required variables.

### Database

npx prisma migrate dev  
npx prisma generate

### Run

npm run dev

---

## License

ISC
# op-market-backend
