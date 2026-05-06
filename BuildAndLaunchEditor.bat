@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "SCRIPT_PATH=%PROJECT_ROOT%aiflow\tools\unreal-editor\scripts\BuildAndLaunchEditor.ps1"
set "PROJECT_FILE=%PROJECT_ROOT%TCF_Sample.uproject"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "SKIP_PAUSE="
set "NON_INTERACTIVE="

if "%UE_SCRIPT_NON_INTERACTIVE%"=="1" set "NON_INTERACTIVE=1"
if "%CI%"=="1" set "NON_INTERACTIVE=1"

for %%a in (%*) do (
    if /i "%%a"=="-NoPause" set "SKIP_PAUSE=1"
    if /i "%%a"=="-NonInteractive" set "NON_INTERACTIVE=1"
)

cd /d "%PROJECT_ROOT%"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" -UProjectPath "%PROJECT_FILE%" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    if not defined NON_INTERACTIVE (
        if not defined SKIP_PAUSE (
            echo.
            echo [Press any key to close this window]
            pause >nul
        )
    )
)

endlocal & exit /b %EXITCODE%
