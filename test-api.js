// Test script for the authentication API
// Run with: node test-api.js

const BASE_URL = 'http://localhost:5000/api';

// Test data
const testUser = {
  name: "Test User",
  email: "test@example.com",
  password: "password123",
  phone: "+917386898469",
  address: "123 Test St, Test City"
};

let accessToken = '';
let refreshToken = '';

// Helper function to make HTTP requests
async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    console.error('Request failed:', error.message);
    return { status: 500, data: { error: error.message } };
  }
}

// Test signup
async function testSignup() {
  console.log('\n🔐 Testing Signup...');
  const result = await makeRequest(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    body: JSON.stringify(testUser)
  });
  
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 201) {
    accessToken = result.data.accessToken;
    refreshToken = result.data.refreshToken;
    console.log('✅ Signup successful!');
  } else {
    console.log('❌ Signup failed!');
  }
}

// Test login with email
async function testLoginWithEmail() {
  console.log('\n🔑 Testing Login with Email...');
  const result = await makeRequest(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: testUser.email,
      password: testUser.password
    })
  });
  
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    accessToken = result.data.accessToken;
    refreshToken = result.data.refreshToken;
    console.log('✅ Login successful!');
  } else {
    console.log('❌ Login failed!');
  }
}

// Test login with phone
async function testLoginWithPhone() {
  console.log('\n📱 Testing Login with Phone...');
  const result = await makeRequest(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      phone: testUser.phone,
      password: testUser.password
    })
  });
  
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    accessToken = result.data.accessToken;
    refreshToken = result.data.refreshToken;
    console.log('✅ Login successful!');
  } else {
    console.log('❌ Login failed!');
  }
}

// Test protected route
async function testProtectedRoute() {
  if (!accessToken) {
    console.log('\n❌ No access token available for protected route test');
    return;
  }
  
  console.log('\n🛡️ Testing Protected Route...');
  const result = await makeRequest(`${BASE_URL}/user/profile`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    console.log('✅ Protected route accessed successfully!');
  } else {
    console.log('❌ Protected route access failed!');
  }
}

// Test refresh token
async function testRefreshToken() {
  if (!refreshToken) {
    console.log('\n❌ No refresh token available for refresh test');
    return;
  }
  
  console.log('\n🔄 Testing Refresh Token...');
  const result = await makeRequest(`${BASE_URL}/auth/refresh-token`, {
    method: 'POST',
    body: JSON.stringify({
      refreshToken: refreshToken
    })
  });
  
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    accessToken = result.data.accessToken;
    refreshToken = result.data.refreshToken;
    console.log('✅ Token refresh successful!');
  } else {
    console.log('❌ Token refresh failed!');
  }
}

// Test logout
async function testLogout() {
  if (!refreshToken) {
    console.log('\n❌ No refresh token available for logout test');
    return;
  }
  
  console.log('\n🚪 Testing Logout...');
  const result = await makeRequest(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    body: JSON.stringify({
      refreshToken: refreshToken
    })
  });
  
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    console.log('✅ Logout successful!');
    accessToken = '';
    refreshToken = '';
  } else {
    console.log('❌ Logout failed!');
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Authentication API Tests...');
  
  await testSignup();
  await testLoginWithEmail();
  await testLoginWithPhone();
  await testProtectedRoute();
  await testRefreshToken();
  await testLogout();
  
  console.log('\n✨ All tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };
