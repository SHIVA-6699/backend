# Backend Authentication API

This backend provides a complete authentication system with JWT tokens, password hashing, and support for both email and phone number login.

## Features

- ✅ User signup with email, password, phone, and address
- ✅ Password hashing using bcrypt
- ✅ Login with email OR phone number + password
- ✅ JWT access tokens (15 minutes) and refresh tokens (7 days)
- ✅ Token refresh endpoint
- ✅ Logout functionality
- ✅ Phone verification via OTP (existing functionality)
- ✅ Protected route middleware

## API Endpoints

### 1. User Signup
```
POST /auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+917386898469",
  "address": "123 Main St, City"
}
```

**Response:**
```json
{
  "message": "User created successfully",
  "user": {
    "_id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+917386898469",
    "address": "123 Main St, City",
    "isPhoneVerified": false,
    "isEmailVerified": false,
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. User Login
```
POST /auth/login
Content-Type: application/json

# Login with email
{
  "email": "john@example.com",
  "password": "password123"
}

# OR login with phone
{
  "phone": "+917386898469",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 3. Refresh Token
```
POST /auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "your_refresh_token_here"
}
```

**Response:**
```json
{
  "accessToken": "new_access_token",
  "refreshToken": "new_refresh_token"
}
```

### 4. Logout
```
POST /auth/logout
Content-Type: application/json

{
  "refreshToken": "your_refresh_token_here"
}
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

### 5. Protected Routes
Use the `Authorization` header with the access token:
```
Authorization: Bearer your_access_token_here
```

## Environment Variables

Create a `.env` file with:

```env
# JWT Secrets (Change these in production!)
ACCESS_TOKEN_SECRET=your-super-secret-access-token-key-here
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key-here

# Database
MONGODB_URI=mongodb://localhost:27017/your-database-name

# Server
PORT=3000
NODE_ENV=development
```

## Middleware Usage

### Protect a route:
```javascript
import { authenticateToken } from '../middleware/auth.js';

router.get('/profile', authenticateToken, (req, res) => {
  // req.user contains the authenticated user
  res.json({ user: req.user });
});
```

### Optional authentication:
```javascript
import { optionalAuth } from '../middleware/auth.js';

router.get('/public-data', optionalAuth, (req, res) => {
  // req.user might contain user if authenticated
  res.json({ data: 'public', user: req.user || null });
});
```

## Security Features

- Passwords are hashed using bcrypt with 12 salt rounds
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Refresh tokens are stored in the database and invalidated on logout
- Email validation with regex pattern
- Phone number validation with international format support

## Database Schema

The User model includes:
- `name`, `email`, `password`, `phone`, `address`
- `isPhoneVerified`, `isEmailVerified`, `isActive`
- `refreshToken` for JWT refresh functionality
- `createdAt`, `updatedAt` timestamps

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200` - Success
- `201` - Created (signup)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid credentials)
- `403` - Forbidden (invalid/expired token)
- `404` - Not Found
- `500` - Internal Server Error
