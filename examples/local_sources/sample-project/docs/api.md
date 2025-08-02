# API Documentation

## Overview

This document describes the API endpoints available in the sample project.

## Endpoints

### GET /api/data

Retrieves sample data from the system.

**Request:**
```http
GET /api/data
Accept: application/json
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "items": ["item1", "item2", "item3"],
    "count": 3
  }
}
```

### POST /api/data

Creates new data entry.

**Request:**
```http
POST /api/data
Content-Type: application/json

{
  "name": "New Item",
  "value": 42
}
```

**Response:**
```json
{
  "status": "created",
  "id": "12345",
  "data": {
    "name": "New Item",
    "value": 42
  }
}
```

## Error Handling

All endpoints return standard HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 404: Not Found
- 500: Internal Server Error