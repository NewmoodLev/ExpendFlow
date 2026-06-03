# Expense Tracker App

Full-stack React + Express + TypeScript expense tracker with login, tags, and CORS support for local development.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   npm run install:all
   ```
2. Create a MongoDB database and set `server/.env` with:
   ```env
   MONGODB_URI=mongodb://127.0.0.1:27017
   DB_NAME=expense-tracker
   PORT=4000
   ```
3. Start both server and client:
   ```bash
   npm run dev
   ```

- Server: http://localhost:4000
- Client: http://localhost:5173

## Authentication

- ใช้หน้าลงทะเบียนเพื่อสร้างบัญชีใหม่
- หลังจากลงทะเบียนแล้วสามารถใช้งาน login ได้ทันที
- ข้อมูลแท็กและรายการจะถูกผูกกับบัญชีผู้ใช้แต่ละคน
