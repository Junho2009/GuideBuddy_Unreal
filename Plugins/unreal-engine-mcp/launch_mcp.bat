@echo off
setlocal EnableDelayedExpansion

:: 优先使用 PATH 中的 uv
where uv >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "UV_CMD=uv"
  goto :run
)

:: Windows 常见 uv 安装位置
if exist "%USERPROFILE%\.local\bin\uv.exe" set "UV_CMD=%USERPROFILE%\.local\bin\uv.exe" && goto :run
if exist "%LOCALAPPDATA%\Programs\uv\uv.exe" set "UV_CMD=%LOCALAPPDATA%\Programs\uv\uv.exe" && goto :run

echo [Unreal MCP] uv not found. Please install: https://docs.astral.sh/uv/getting-started/installation/
exit /b 1

:run
cd /d "%~dp0Python"
set PYTHONUNBUFFERED=1
"%UV_CMD%" run unreal_mcp_server_advanced.py
