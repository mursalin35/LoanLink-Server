# LoanLink – Microloan Request & Approval Tracker System 
## Project Overview
LoanLink Backend is the server-side application of the LoanLink platform. It is responsible for handling business logic, authentication, authorization, database operations, and API management for the microloan request and approval system.

This backend serves multiple user roles including Borrowers, Managers (Loan Officers), and Admins, ensuring secure and role-based access to resources.

## Live API Base URL
🔗 **Server Site:** [Visit Server site](https://loanlink-server-bd.vercel.app/)

## Website Information
🔗 **Live Site:** [Visit Live site](https://loanlink-side.web.app/)
🔗 **Live Site Repository:** [Visit Live repo](https://github.com/mursalin35/LoanLink-Client.git)

## Key Responsibilities
- RESTful API development
- User authentication & authorization
- Loan request management
- Role-based access control
- Secure data handling
- Database communication

## Features 
- JWT-based authentication & authorization
- Role-based access (User, Manager, Admin)
- Secure REST APIs
- Loan creation, update, approval & rejection
- User & role management
- Protected routes with middleware
- Centralized error handling
- Environment-based configuration

## API Endpoints (Overview)
### Auth
- POST `/auth/register`
- POST `/auth/login`
- POST `/auth/logout`
<!-- - GET `/auth/refresh-token` -->

### Users
- GET `/users`
- GET `/users/:id`
- PATCH `/users/role`
- DELETE `/users/:id`

### Loans
- POST `/loans`
- GET `/loans`
- GET `/loans/:id`
- PATCH `/loans/approve`
- PATCH `/loans/reject`

## Tech Stack
- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT
- Firebase Admin SDK
- Cookie-parser
- Dotenv

## NPM Packages Used
- express
- mongoose
- jsonwebtoken
- cors
- dotenv
- cookie-parser
- firebase-admin
- nodemon

## Folder Structure
```
server/
├── controllers/
├── routes/
├── models/
├── middlewares/
├── utils/
├── config/
├── index.js
└── .env
```

## Environment Variables
Create a `.env` file in the root directory and add:
```
PORT=5000
DB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
FIREBASE_SERVICE_ACCOUNT=your_firebase_credentials
```

## Authentication & Security
- JWT tokens stored in HTTP-only cookies
- Firebase token verification
- Role-based middleware protection
- CORS configured for frontend domain
- Secure environment variables

## Error Handling
- Global error handling middleware
- Proper HTTP status codes
- Structured error responses

## Deployment Notes
- Hosting Platform: (e.g., Vercel )
- Ensure environment variables are configured
- Enable CORS for frontend domain
- Use production MongoDB database

## Commit Guidelines
- Use meaningful commit messages
- Follow feature-based commit structure
- Example:
```
feat: add loan approval API
fix: resolve JWT verification issue
```

## Author
- Name: Md. Saiyedul Mursalin
- Protfolio: https://saiyedul-mursalin.vercel.app  
- LinkedIn: https://www.linkedin.com/in/mursalin07  

## License
This project is for educational purposes.
