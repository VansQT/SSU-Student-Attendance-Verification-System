<#!
.SYNOPSIS
Installs the Windows-compatible runtime for the local SSU face-recognition API.

.DESCRIPTION
The upstream dlib package compiles from source on Windows and requires Visual
Studio C++ Build Tools. This project supports local Python 3.9 installations
without that toolchain by using the compatible prebuilt dlib-bin package.
#>

[CmdletBinding()]
param(
  [string]$PythonVersion = '3.9'
)

$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSCommandPath
$venvPath = Join-Path $serviceRoot '.venv'
$venvPython = Join-Path $venvPath 'Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
  & py "-$PythonVersion" -m venv $venvPath
  if ($LASTEXITCODE -ne 0) {
    throw "Python $PythonVersion could not create the face-recognition environment."
  }
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install dlib-bin==19.24.6
& $venvPython -m pip install Werkzeug Flask gunicorn numpy urllib3 requests face-recognition-models Pillow
& $venvPython -m pip install --no-deps face_recognition==1.3.0
& $venvPython -c "import dlib, face_recognition, flask; print('Face-recognition runtime ready:', dlib.__version__)"
