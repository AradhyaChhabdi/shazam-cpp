@echo off
REM Shazam-CPP Engine Build Script for Windows
REM Requires g++ (MinGW) or Visual Studio Developer Command Prompt

echo Building Shazam-CPP Engine...

REM Create bin directory if it doesn't exist
if not exist "bin" mkdir bin

REM Try g++ first (MinGW)
where g++ >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Using g++ compiler...
    g++ -std=c++11 -O2 src/main.cpp -o bin/shazam_engine.exe
    if %ERRORLEVEL% EQU 0 (
        echo Build successful! Executable: bin\shazam_engine.exe
        exit /b 0
    ) else (
        echo g++ build failed!
        exit /b 1
    )
)

REM Try cl.exe (Visual Studio)
where cl >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Using MSVC compiler...
    cl /std:c++17 /O2 /EHsc /I include src/main.cpp /Fe:bin/shazam_engine.exe
    if %ERRORLEVEL% EQU 0 (
        echo Build successful! Executable: bin\shazam_engine.exe
        exit /b 0
    ) else (
        echo MSVC build failed!
        exit /b 1
    )
)

echo ERROR: No C++ compiler found!
echo Please install one of the following:
echo   - MinGW-w64 (g++): https://www.mingw-w64.org/
echo   - Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/
exit /b 1
