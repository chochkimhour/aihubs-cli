@echo off

if "%1"=="--version" (
  echo provider mock 1.0.0
  exit /b 0
)

if "%1"=="login" (
  echo Mock provider login successful
  exit /b 0
)

echo Unknown provider command: %*
exit /b 1
