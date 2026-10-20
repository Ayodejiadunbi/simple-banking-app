# Banking API

A full-stack demonstration banking app built with vanilla JavaScript, Node.js, Express and MongoDB. It supports account creation, secure login, balances, deposits, withdrawals, account-to-account transfers and transaction history.

> This is an educational portfolio project. It does not connect to a bank or payment provider and must not be used to process real money.

## Features

- Email/password registration and login
- bcrypt password hashing and expiring JWT access tokens
- Optional Firebase Google authentication
- Unique eight-digit account numbers
- Monetary values stored as integer pence
- Atomic MongoDB transfers and overdraft prevention
- Transaction history
- Responsive browser dashboard served from `public/`
- Configurable CORS and environment validation

## Run locally

1. Run `npm install`.
2. Copy `.env.example` to `.env` and add your MongoDB URL and JWT secret.
3. Run `npm start` or `npm run dev`.
4. Open `http://localhost:3000` for the browser app. You can also use `test.rest` with VS Code REST Client or use Postman.

MongoDB transfers require a replica set. MongoDB Atlas provides this automatically.

## Main endpoints

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | No | Service health |
| POST | `/signup` | No | Create an account |
| POST | `/signin` | No | Sign in |
| POST | `/google-auth` | No | Sign in with Firebase |
| GET | `/account` | Bearer token | View account and balance |
| POST | `/account/deposit` | Bearer token | Add demonstration funds |
| POST | `/account/withdraw` | Bearer token | Withdraw demonstration funds |
| POST | `/account/transfer` | Bearer token | Transfer between users atomically |
| GET | `/transactions` | Bearer token | View recent transactions |

## Deployment

Configure `DATABASE_URL`, `SECRET_ACCESS_KEY`, `ALLOWED_ORIGIN` and optionally `FIREBASE_SERVICE_ACCOUNT` in the hosting platform. Never commit `.env` or Firebase credentials.
