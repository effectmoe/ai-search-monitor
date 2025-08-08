#!/bin/bash

# Test script for authentication endpoints

echo "🧪 Testing AI Search Monitor Authentication System"
echo "================================================"

BASE_URL="http://localhost:3002"

echo ""
echo "1. Testing Health Check"
echo "curl -s $BASE_URL/ping"
curl -s "$BASE_URL/ping" | jq || curl -s "$BASE_URL/ping"

echo ""
echo "2. Getting API Information"
echo "curl -s $BASE_URL/api"
curl -s "$BASE_URL/api" | jq || curl -s "$BASE_URL/api"

echo ""
echo "3. Testing Login with Admin User"
echo 'curl -s -X POST $BASE_URL/auth/login -H "Content-Type: application/json" -d '"'"'{"email":"admin@example.com","password":"password123"}'"'"''
ADMIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"password123"}')
echo "$ADMIN_RESPONSE" | jq || echo "$ADMIN_RESPONSE"

# Extract token from response
ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | jq -r '.data.token // empty' 2>/dev/null || echo "")

if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
  echo ""
  echo "4. Testing Protected Route with Admin Token"
  echo 'curl -s $BASE_URL/auth/me -H "Authorization: Bearer $ADMIN_TOKEN"'
  curl -s "$BASE_URL/auth/me" -H "Authorization: Bearer $ADMIN_TOKEN" | jq || curl -s "$BASE_URL/auth/me" -H "Authorization: Bearer $ADMIN_TOKEN"
else
  echo ""
  echo "❌ Could not extract admin token, skipping protected route test"
fi

echo ""
echo "5. Testing Login with Regular User"
echo 'curl -s -X POST $BASE_URL/auth/login -H "Content-Type: application/json" -d '"'"'{"email":"user@example.com","password":"password123"}'"'"''
USER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{"email":"user@example.com","password":"password123"}')
echo "$USER_RESPONSE" | jq || echo "$USER_RESPONSE"

echo ""
echo "6. Testing Invalid Login"
echo 'curl -s -X POST $BASE_URL/auth/login -H "Content-Type: application/json" -d '"'"'{"email":"invalid@example.com","password":"wrong"}'"'"''
curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{"email":"invalid@example.com","password":"wrong"}' | jq || curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{"email":"invalid@example.com","password":"wrong"}'

echo ""
echo "7. Testing Database Integration"
echo "curl -s $BASE_URL/test/clients"
curl -s "$BASE_URL/test/clients" | jq || curl -s "$BASE_URL/test/clients"

echo ""
echo "8. Testing Protected Route without Token"
echo "curl -s $BASE_URL/auth/me"
curl -s "$BASE_URL/auth/me" | jq || curl -s "$BASE_URL/auth/me"

echo ""
echo "✅ Authentication system tests completed!"