# Smart Carpark API

Backend API สำหรับระบบ Smart Carpark สร้างด้วย Node.js, Express, Prisma และ PostgreSQL

โปรเจกต์นี้เตรียมไว้ให้รันได้ทั้งแบบ local development และ production ผ่าน Docker Compose โดยมี Nginx เป็น reverse proxy หน้า API

## Tech Stack

- Node.js 20
- Express
- Prisma
- PostgreSQL 16
- Docker Compose
- Nginx
- Swagger UI / OpenAPI
- Postman Collection

## Environment

ไฟล์ที่ใช้จริงคือ `.env`

ไฟล์ `.env.example` เป็นตัวอย่างสำหรับขึ้น Git เท่านั้น ไม่ได้ถูกใช้ตอนรันจริง

ตัวอย่างค่าหลักที่ต้องมี:

```env
PORT=8080
CORS_ORIGINS=https://carpark-beta.vercel.app,https://admin-carpark.vercel.app

POSTGRES_DB=smart_carpark_uat
POSTGRES_USER=smart_carpark
POSTGRES_PASSWORD=your_password
DATABASE_URL="postgresql://smart_carpark:your_password@localhost:5433/smart_carpark_uat?schema=public"

AUTH_TOKEN_SECRET=your_auth_secret
```

หมายเหตุ:

- ถ้ารัน API ตรงบนเครื่องด้วย `npm start` ให้ใช้ `DATABASE_URL` host เป็น `localhost:5433`
- ถ้ารัน API ผ่าน Docker Compose ค่า `DATABASE_URL` ของ service `api` จะถูกตั้งใน `docker-compose.yml` ให้ชี้ไปที่ `db:5432` อัตโนมัติ
- ระบบตั้งใจใช้ port `8080` เป็นหลัก

## Run Local

วิธีนี้เหมาะสำหรับทดสอบ API บนเครื่อง โดยให้ PostgreSQL รันใน Docker และ API รันด้วย Node.js บนเครื่อง

1. ติดตั้ง dependencies

```bash
npm install
```

2. เปิด PostgreSQL container

```bash
docker compose up -d db
```

3. สร้าง Prisma Client

```bash
npm run prisma:generate
```

4. รัน migration

```bash
npm run db:migrate
```

5. ใส่ seed data สำหรับทดสอบ

```bash
npm run db:seed
```

6. รัน API

```bash
npm run dev
```

หรือถ้าต้องการรันแบบปกติ:

```bash
npm start
```

API จะเปิดที่:

```text
http://localhost:8080
```

ตรวจสอบ health check:

```text
http://localhost:8080/health
http://localhost:8080/health/db
```

## API Docs บน Localhost

เปิด Swagger UI ได้ที่:

```text
http://localhost:8080/docs
```

OpenAPI JSON:

```text
http://localhost:8080/docs/openapi.json
```

รายการ API และรายละเอียด request/response ให้ดูในหน้า Docs เป็นหลัก ไม่ต้องดูจาก README

### Transaction จากกล้องอ่านป้ายทะเบียน

ใช้ endpoint นี้สำหรับกล้อง LPR หลังจากแปลงป้ายทะเบียนเป็น string แล้วส่งเข้า Backend:

```http
POST /api/v1/transactions
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "plateNo": "1กก1234",
  "vehicleType": "car",
  "cameraId": "CAM-IN-01",
  "gateId": "GATE-A",
  "direction": "IN",
  "capturedAt": "2026-05-22T10:30:00+07:00",
  "confidence": 0.92,
  "imageUrl": "https://example.com/plate.jpg"
}
```

Backend จะ normalize `plateNo`, รองรับ `vehicleType` เฉพาะ `car` และ `motorcycle`, ตรวจข้อมูลจำเป็น, กันรายการซ้ำจาก `plateNo + cameraId + direction` ภายใน 10 วินาที และตอบ `OPEN_GATE`, `VALIDATION_ERROR` หรือ `IGNORE_DUPLICATE` ในรูปแบบ response เดียวกันเสมอ

สถานะ transaction หลัก:

- `pending` ยังไม่ได้จ่าย
- `partially_paid` จ่ายบางส่วน
- `completed` จ่ายครบหรือจบรายการแล้ว
- `cancelled` ยกเลิก

ค่า `exitAt` จะเป็น `null` ตอนรถเข้า และจะถูกเติมจาก `capturedAt` เมื่อกล้องส่ง `direction: "OUT"` ตอนรถออกจริง

## ทดสอบด้วย Postman

โปรเจกต์มี Postman Collection เตรียมไว้ที่:

```text
postman/Smart-Carpark-API.postman_collection.json
```

วิธีใช้งาน:

1. เปิด Postman
2. Import collection จากไฟล์ด้านบน
3. ตรวจว่า collection variable `baseUrl` เป็น:

```text
http://localhost:8080
```

4. เรียก request `Auth > Login`
5. เมื่อ login สำเร็จ collection จะบันทึก `token` และ `refreshToken` ให้อัตโนมัติ
6. เรียก API อื่น ๆ ใน collection ต่อได้เลย

บัญชี seed data สำหรับทดสอบ:

| Role | Username | Password |
| --- | --- | --- |
| Super Admin | `admin1` | `123` |
| Cashier | `cashier` | `123456` |
| Super Admin | `superadmin` | `123456` |

## Run Local ด้วย Docker Compose ทั้งชุด

ถ้าต้องการทดสอบให้ใกล้เคียง production มากขึ้น ให้รัน API, PostgreSQL และ Nginx ทั้งหมดผ่าน Docker Compose:

```bash
docker compose up -d --build
```

หลังจาก container ขึ้นแล้ว รัน migration:

```bash
docker compose exec api npm run db:migrate
```

ใส่ seed data:

```bash
docker compose exec api npm run db:seed
```

เปิดใช้งานผ่าน Nginx:

```text
http://localhost:8080
http://localhost:8080/docs
```

ดู log:

```bash
docker compose logs -f api
docker compose logs -f nginx
docker compose logs -f db
```

ปิด service:

```bash
docker compose down
```

## Deploy ผ่าน GitHub, Docker และ Nginx

ภาพรวม flow:

1. Push code ขึ้น GitHub
2. SSH เข้า server
3. Clone หรือ pull repo จาก GitHub
4. ตั้งค่า `.env` บน server
5. Build และ start ด้วย Docker Compose
6. รัน migration
7. ตรวจ health check และ Docs

### เตรียม Server

บน server ต้องมี:

- Git
- Docker
- Docker Compose plugin
- Port ที่เปิดใช้งาน: `8080`

Clone repo:

```bash
git clone <your-github-repo-url>
cd Smart-carpark-API
```

ถ้ามี repo อยู่แล้ว:

```bash
git pull
```

สร้าง `.env`:

```bash
cp .env.example .env
nano .env
```

ตั้งค่า `.env` บน server ให้ตรงกับ environment จริง เช่น CORS, database และ secret

### Start Production

```bash
docker compose up -d --build
```

รัน migration:

```bash
docker compose exec api npm run db:migrate
```

ถ้าเป็น server ใหม่และต้องการข้อมูลตั้งต้น:

```bash
docker compose exec api npm run db:seed
```

ตรวจสถานะ:

```bash
docker compose ps
docker compose logs -f api
```

## API Docs หลัง Deploy

ถ้าใช้ IP และ port 8080:

```text
http://SERVER_IP:8080/docs
http://SERVER_IP:8080/docs/openapi.json
```

ถ้าใช้ domain ที่ชี้มาที่ server และยังเปิดผ่าน port 8080:

```text
http://your-domain.com:8080/docs
http://your-domain.com:8080/docs/openapi.json
```

ถ้าภายหลังตั้ง Nginx/SSL ให้รับผ่าน port 80 หรือ 443 หน้า server แล้ว URL จะเป็น:

```text
https://your-domain.com/docs
https://your-domain.com/docs/openapi.json
```

## Update Version บน Server

เมื่อมี code ใหม่บน GitHub:

```bash
git pull
docker compose up -d --build
docker compose exec api npm run db:migrate
docker compose logs -f api
```

## Useful Commands

Prisma:

```bash
npm run prisma:generate
npm run db:migrate
npm run db:seed
```

Docker:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
docker compose down
```

Health check:

```text
http://localhost:8080/health
http://localhost:8080/health/db
```
