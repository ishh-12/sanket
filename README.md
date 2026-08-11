# SANKET MONOREPO

This repository contains the SANKET project migrated into a MERN-style architecture.

## Structure

- `frontend/` - Vite + React web application
- `backend/` - Node.js + Express API server
- `agent/` - Java Maven agent skeleton

## Quick Start

### Frontend

1. `cd frontend`
2. `npm install`
3. `npm run dev`

### Backend

1. `cd backend`
2. `npm install`
3. `npm run dev`

### Java Agent

1. `cd agent`
2. `mvn compile`
3. `mvn exec:java -Dexec.mainClass="com.sanket.Agent"`

## Notes

- Backend is MongoDB-ready. Update `MONGODB_URI` in `backend/src/config/db.js`.
- Frontend maintains the original SANKET UI design and animations.
