#Requires -Version 5.1
<#
.SYNOPSIS
    Build and launch Unreal Editor for a project (generic toolchain script).
.DESCRIPTION
    Resolves engine from .uproject EngineAssociation, runs UnrealBuildTool
    incremental build, then starts UnrealEditor. The launch step can optionally
    target a specific map, run in game mode, execute startup commands, wait for
    process exit, and redirect logs to a deterministic file for automation.
.PARAMETER ProjectDir
    Directory containing exactly one .uproject (or path to that directory).
.PARAMETER UProjectPath
    Full path to a .uproject file. Overrides ProjectDir when set.
.PARAMETER BuildOnly
    Only build; do not launch the editor.
.PARAMETER LaunchOnly
    Only launch the editor; do not build.
.PARAMETER Map
    Optional map or URL parameter, such as /Game/Maps/TestMap.umap.
.PARAMETER LaunchMode
    Editor keeps the full editor UI; Game launches uncooked game mode via -game.
.PARAMETER ExecCmds
    Optional startup console commands, for example "Battle.RunVerifier,Quit".
.PARAMETER WaitForExit
    Wait for the launched Unreal process to exit and return its exit code.
.PARAMETER TimeoutSec
    Optional timeout used only with -WaitForExit. 0 means wait indefinitely.
.PARAMETER LogPath
    Optional absolute or project-relative log file path passed via -ABSLOG=.
.PARAMETER Unattended
    Adds -unattended to the Unreal launch arguments.
.PARAMETER NoSplash
    Adds -nosplash to the Unreal launch arguments.
.PARAMETER NullRHI
    Adds -nullrhi to the Unreal launch arguments.
.PARAMETER LogWindow
    Adds -log to the Unreal launch arguments.
.PARAMETER ExtraArgs
    Additional Unreal launch arguments, primarily for direct PowerShell callers.
.NOTES
    Set UE_ENGINE to override engine path. Close the editor before building to avoid Live Coding.
#>

param(
    [string] $ProjectDir,
    [string] $UProjectPath,
    [switch] $BuildOnly,
    [switch] $LaunchOnly,
    [switch] $NonInteractive,
    [switch] $NoPause,
    [string] $Map,
    [ValidateSet('Editor', 'Game')]
    [string] $LaunchMode = 'Editor',
    [string] $ExecCmds,
    [switch] $WaitForExit,
    [int] $TimeoutSec = 0,
    [string] $LogPath,
    [switch] $Unattended,
    [switch] $NoSplash,
    [switch] $NullRHI,
    [switch] $LogWindow,
    [string[]] $ExtraArgs = @()
)

$ErrorActionPreference = 'Stop'
$NonInteractiveMode = $NonInteractive -or ($env:UE_SCRIPT_NON_INTERACTIVE -eq '1') -or ($env:CI -eq '1')

function Write-ErrorLine {
    param([string]$Code, [hashtable]$Fields = @{})
    $parts = @("ERROR: $Code") + ($Fields.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })
    $line = $parts -join ' | '
    Write-Host $line -ForegroundColor Red
}

function Resolve-ProjectFile {
    param(
        [string]$ProjectDirArg,
        [string]$UProjectPathArg
    )

    if ($UProjectPathArg -and (Test-Path -LiteralPath $UProjectPathArg -PathType Leaf)) {
        return (Get-Item -LiteralPath $UProjectPathArg)
    }

    if ($ProjectDirArg -and (Test-Path -LiteralPath $ProjectDirArg -PathType Container)) {
        $found = Get-ChildItem -Path $ProjectDirArg -Filter '*.uproject' -File
        if ($found.Count -eq 0) {
            Write-ErrorLine -Code 'UPROJECT_NOT_FOUND' -Fields @{ ProjectDir = $ProjectDirArg; Action = 'Pass a directory with exactly one .uproject or UProjectPath' }
            exit 1
        }
        if ($found.Count -gt 1) {
            Write-ErrorLine -Code 'UPROJECT_NOT_FOUND' -Fields @{ ProjectDir = $ProjectDirArg; Action = 'Multiple .uproject found; pass UProjectPath' }
            exit 1
        }
        return $found[0]
    }

    $dir = (Get-Location).Path
    $found = Get-ChildItem -Path $dir -Filter '*.uproject' -File
    if ($found.Count -eq 0) {
        Write-ErrorLine -Code 'UPROJECT_NOT_FOUND' -Fields @{ Cwd = $dir; Action = 'Run from project root or pass ProjectDir / UProjectPath' }
        exit 1
    }
    if ($found.Count -gt 1) {
        Write-ErrorLine -Code 'UPROJECT_NOT_FOUND' -Fields @{ Cwd = $dir; Action = 'Multiple .uproject; pass UProjectPath' }
        exit 1
    }
    return $found[0]
}

function Resolve-LogPath {
    param(
        [string]$ProjectRoot,
        [string]$RequestedPath
    )

    if (-not $RequestedPath) {
        return $null
    }

    $resolvedPath = $RequestedPath
    if (-not [System.IO.Path]::IsPathRooted($resolvedPath)) {
        $resolvedPath = Join-Path $ProjectRoot $resolvedPath
    }

    $fullPath = [System.IO.Path]::GetFullPath($resolvedPath)
    $parentDir = Split-Path -Parent $fullPath
    if ($parentDir) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }

    return $fullPath
}

function Convert-ToWindowsCommandLineArgument {
    param([AllowEmptyString()][string]$Argument)

    if ($null -eq $Argument) {
        return '""'
    }

    if ($Argument.Length -eq 0) {
        return '""'
    }

    if ($Argument -notmatch '[\s"]') {
        return $Argument
    }

    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append('"')
    $backslashCount = 0

    foreach ($char in $Argument.ToCharArray()) {
        if ($char -eq '\') {
            $backslashCount++
            continue
        }

        if ($char -eq '"') {
            if ($backslashCount -gt 0) {
                [void]$builder.Append(('\' * ($backslashCount * 2)))
                $backslashCount = 0
            }
            [void]$builder.Append('\')
            [void]$builder.Append('"')
            continue
        }

        if ($backslashCount -gt 0) {
            [void]$builder.Append(('\' * $backslashCount))
            $backslashCount = 0
        }

        [void]$builder.Append($char)
    }

    if ($backslashCount -gt 0) {
        [void]$builder.Append(('\' * ($backslashCount * 2)))
    }

    [void]$builder.Append('"')
    return $builder.ToString()
}

function Start-UnrealProcess {
    param(
        [string]$ExecutablePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $processStartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processStartInfo.FileName = $ExecutablePath
    $processStartInfo.WorkingDirectory = $WorkingDirectory
    $processStartInfo.UseShellExecute = $false
    $processStartInfo.Arguments = (($Arguments | ForEach-Object { Convert-ToWindowsCommandLineArgument $_ }) -join ' ')

    return [System.Diagnostics.Process]::Start($processStartInfo)
}

if ($BuildOnly -and $LaunchOnly) {
    Write-ErrorLine -Code 'INVALID_ARGUMENTS' -Fields @{ Action = 'Do not pass both -BuildOnly and -LaunchOnly' }
    exit 1
}

if ($TimeoutSec -lt 0) {
    Write-ErrorLine -Code 'INVALID_ARGUMENTS' -Fields @{ TimeoutSec = $TimeoutSec; Action = 'Use 0 or a positive timeout in seconds' }
    exit 1
}

$uproject = Resolve-ProjectFile -ProjectDirArg $ProjectDir -UProjectPathArg $UProjectPath
$UprojectPath = $uproject.FullName
$ProjectName = [System.IO.Path]::GetFileNameWithoutExtension($uproject.Name)
$ProjectRoot = Split-Path -Parent $UprojectPath

$uprojectJson = Get-Content -Path $UprojectPath -Raw -Encoding UTF8 | ConvertFrom-Json
$EngineAssociation = $uprojectJson.EngineAssociation.Trim()
if (-not $EngineAssociation) {
    Write-ErrorLine -Code 'ENGINE_ASSOCIATION_MISSING' -Fields @{ Project = $UprojectPath; Action = 'Ensure .uproject has EngineAssociation field' }
    exit 1
}

# Resolve engine root
$EngineRoot = $env:UE_ENGINE
if (-not $EngineRoot -or -not (Test-Path -LiteralPath $EngineRoot)) {
    if ($EngineAssociation -match '-') {
        $buildsPath = 'HKCU:\SOFTWARE\Epic Games\Unreal Engine\Builds'
        if (Test-Path $buildsPath) {
            $val = Get-ItemProperty -Path $buildsPath -Name $EngineAssociation -ErrorAction SilentlyContinue
            if ($val) { $EngineRoot = $val.$EngineAssociation }
        }
    }
    if (-not $EngineRoot -or -not (Test-Path -LiteralPath $EngineRoot)) {
        $regPath = "HKLM:\SOFTWARE\EpicGames\Unreal Engine\$EngineAssociation"
        if (-not (Test-Path $regPath)) { $regPath = "HKLM:\SOFTWARE\WOW6432Node\EpicGames\Unreal Engine\$EngineAssociation" }
        if (Test-Path $regPath) {
            $EngineRoot = (Get-ItemProperty -Path $regPath -Name 'InstalledDirectory' -ErrorAction SilentlyContinue).InstalledDirectory
        }
    }
    if (-not $EngineRoot -or -not (Test-Path -LiteralPath $EngineRoot)) {
        $EngineRoot = "C:\Program Files\Epic Games\UE_$EngineAssociation"
    }
}

$BuildBat = Join-Path $EngineRoot 'Engine\Build\BatchFiles\Build.bat'
$UnrealEditor = Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor.exe'

if (-not (Test-Path -LiteralPath $BuildBat)) {
    Write-ErrorLine -Code 'ENGINE_NOT_FOUND' -Fields @{ Association = $EngineAssociation; Path_checked = $EngineRoot; Project = $UprojectPath }
    Write-ErrorLine -Code 'ENGINE_NOT_FOUND' -Fields @{ Action = 'User must run "Switch Unreal Engine Version" on this .uproject or set UE_ENGINE to engine root. Then re-run this script.' }
    if (-not $NonInteractiveMode) {
        $uvs = $null
        try {
            $installDir = (Get-ItemProperty -Path 'HKLM:\SOFTWARE\EpicGames\Unreal Engine' -Name 'INSTALLDIR' -ErrorAction SilentlyContinue).INSTALLDIR
            if ($installDir) { $uvs = Join-Path $installDir 'Launcher\Engine\Binaries\Win64\UnrealVersionSelector.exe' }
        } catch {}
        if (-not $uvs -or -not (Test-Path -LiteralPath $uvs)) { $uvs = 'C:\Program Files (x86)\Epic Games\Launcher\Engine\Binaries\Win64\UnrealVersionSelector.exe' }
        if (-not (Test-Path -LiteralPath $uvs)) { $uvs = 'C:\Program Files\Epic Games\Launcher\Engine\Binaries\Win64\UnrealVersionSelector.exe' }
        if (Test-Path -LiteralPath $uvs) {
            Write-Host "Opening Switch Unreal Engine Version..." -ForegroundColor Yellow
            Start-Process -FilePath $uvs -ArgumentList '/switchversion', "`"$UprojectPath`""
            Write-Host "After selecting an engine, run this script again."
        } else {
            Write-ErrorLine -Code 'ENGINE_NOT_FOUND' -Fields @{ Action = 'UnrealVersionSelector not found. Install Epic Games Launcher or associate .uproject with an engine.' }
        }
    }
    exit 2
}

Write-Host "Project: $ProjectName | Engine: $EngineRoot" -ForegroundColor Cyan

if (-not $LaunchOnly) {
    Write-Host "Building ${ProjectName}Editor Win64 Development ..." -ForegroundColor Yellow
    $target = "${ProjectName}Editor"
    & $BuildBat $target Win64 Development "-Project=$UprojectPath" -WaitMutex
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorLine -Code 'BUILD_FAILED' -Fields @{ Project = $UprojectPath; Target = "${ProjectName}Editor"; ExitCode = $LASTEXITCODE; Action = 'Check %LOCALAPPDATA%\UnrealBuildTool\Build.txt' }
        exit 1
    }
    Write-Host "Build succeeded." -ForegroundColor Green
}

if (-not $BuildOnly) {
    $editorArgs = @($UprojectPath)

    if ($Map) { $editorArgs += $Map }
    if ($LaunchMode -eq 'Game') { $editorArgs += '-game' }
    if ($ExecCmds) { $editorArgs += "-ExecCmds=$ExecCmds" }

    $resolvedLogPath = Resolve-LogPath -ProjectRoot $ProjectRoot -RequestedPath $LogPath
    if ($resolvedLogPath) {
        $editorArgs += "-ABSLOG=$resolvedLogPath"
        Write-Host "Log Path: $resolvedLogPath" -ForegroundColor DarkCyan
    }

    if ($Unattended) { $editorArgs += '-unattended' }
    if ($NoSplash) { $editorArgs += '-nosplash' }
    if ($NullRHI) { $editorArgs += '-nullrhi' }
    if ($LogWindow) { $editorArgs += '-log' }
    if ($ExtraArgs.Count -gt 0) { $editorArgs += $ExtraArgs }

    if ($Map) { Write-Host "Launch Map: $Map" -ForegroundColor DarkCyan }
    if ($LaunchMode -ne 'Editor') { Write-Host "Launch Mode: $LaunchMode" -ForegroundColor DarkCyan }
    if ($ExecCmds) { Write-Host "ExecCmds: $ExecCmds" -ForegroundColor DarkCyan }

    Write-Host "Launching editor: $UprojectPath" -ForegroundColor Yellow

    if ($WaitForExit) {
        $process = Start-UnrealProcess -ExecutablePath $UnrealEditor -Arguments $editorArgs -WorkingDirectory $ProjectRoot
        if ($TimeoutSec -gt 0) {
            if (-not $process.WaitForExit($TimeoutSec * 1000)) {
                try {
                    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                } catch {}
                Write-ErrorLine -Code 'LAUNCH_TIMEOUT' -Fields @{ TimeoutSec = $TimeoutSec; Project = $UprojectPath; Map = $Map }
                exit 3
            }
        } else {
            $process.WaitForExit()
        }

        $process.Refresh()
        $editorExitCode = $process.ExitCode
        if ($null -eq $editorExitCode) {
            $editorExitCode = 0
        } else {
            $editorExitCode = [int]$editorExitCode
        }

        if ($editorExitCode -ne 0) {
            Write-ErrorLine -Code 'EDITOR_EXIT_NONZERO' -Fields @{ ExitCode = $editorExitCode; Project = $UprojectPath; Map = $Map }
        }
        exit $editorExitCode
    }

    [void](Start-UnrealProcess -ExecutablePath $UnrealEditor -Arguments $editorArgs -WorkingDirectory $ProjectRoot)
}
