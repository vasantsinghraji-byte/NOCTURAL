@echo off
REM Clear any conflicting environment variables
set MONGODB_URI=
set "MONGODB_URI="

REM Start the development server
echo Starting Nocturnal Backend...
npm run dev
