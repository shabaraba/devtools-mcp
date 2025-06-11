#!/bin/bash

echo "Testing direct log submission to HTTP server..."

curl -X POST http://localhost:3456/api/browser-logs \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": '$(date +%s000)',
    "level": "log",
    "message": "Test log from curl",
    "url": "http://localhost:3001/test",
    "port": "3001",
    "project": "test-project"
  }'

echo -e "\n\nChecking stats..."
curl -X GET http://localhost:3456/api/browser-logs/stats