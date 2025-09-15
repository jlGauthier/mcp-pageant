@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================
echo    WSL Entry Remover for .claude.json
echo ========================================
echo.

set "CLAUDE_JSON=C:\Users\jgaut\.claude.json"
set "TEMP_FILE=%TEMP%\claude_clean.json"
set "BACKUP_FILE=%CLAUDE_JSON%.backup-%DATE:~-4%%DATE:~4,2%%DATE:~7,2%-%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%.json"

REM Remove colons and spaces from backup filename
set "BACKUP_FILE=!BACKUP_FILE: =!"
set "BACKUP_FILE=!BACKUP_FILE::=!"

echo Checking for .claude.json...
if not exist "%CLAUDE_JSON%" (
    echo ERROR: File not found: %CLAUDE_JSON%
    pause
    exit /b 1
)

echo Creating backup at: !BACKUP_FILE!
copy "%CLAUDE_JSON%" "!BACKUP_FILE!" >nul
if errorlevel 1 (
    echo ERROR: Failed to create backup
    pause
    exit /b 1
)

echo.
echo Removing WSL entries...
echo.

REM Use Node.js to process the JSON file
node -e "
const fs = require('fs');

try {
    // Read the file
    const content = fs.readFileSync('%CLAUDE_JSON%', 'utf8');
    const data = JSON.parse(content);

    let removedCount = 0;
    let originalCount = 0;

    // Check if projects exists
    if (data.projects) {
        originalCount = Object.keys(data.projects).length;
        console.log('Original projects: ' + originalCount);

        // Filter out WSL entries
        const cleanedProjects = {};
        for (const [path, value] of Object.entries(data.projects)) {
            // Skip if it starts with /mnt/ or //mnt/ (WSL paths)
            if (path.startsWith('/mnt/') || path.startsWith('//mnt/') ||
                path.startsWith('/home/') || path.startsWith('//home/') ||
                path.startsWith('/usr/') || path.startsWith('//usr/') ||
                path.startsWith('/opt/') || path.startsWith('//opt/') ||
                path.startsWith('/var/') || path.startsWith('//var/') ||
                path.startsWith('/tmp/') || path.startsWith('//tmp/')) {
                console.log('  Removing WSL path: ' + path);
                removedCount++;
            } else {
                cleanedProjects[path] = value;
            }
        }

        data.projects = cleanedProjects;

        console.log('');
        console.log('Removed ' + removedCount + ' WSL entries');
        console.log('Remaining projects: ' + Object.keys(cleanedProjects).length);

        // Write the cleaned data
        fs.writeFileSync('%TEMP_FILE%', JSON.stringify(data, null, 2));

        // Calculate size difference
        const originalSize = fs.statSync('%CLAUDE_JSON%').size;
        const newSize = fs.statSync('%TEMP_FILE%').size;
        const reduction = originalSize - newSize;
        const percent = ((reduction / originalSize) * 100).toFixed(1);

        console.log('');
        console.log('File size reduction: ' + (reduction/1024).toFixed(2) + ' KB (' + percent + '%%)');

    } else {
        console.log('No projects section found in .claude.json');
        process.exit(1);
    }

} catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
}
"

if errorlevel 1 (
    echo.
    echo ERROR: Failed to process JSON file
    pause
    exit /b 1
)

echo.
echo Replacing original file...
move /Y "%TEMP_FILE%" "%CLAUDE_JSON%" >nul
if errorlevel 1 (
    echo ERROR: Failed to replace original file
    echo Backup is available at: !BACKUP_FILE!
    pause
    exit /b 1
)

echo.
echo ========================================
echo    SUCCESS! WSL entries removed
echo    Backup saved to: !BACKUP_FILE!
echo ========================================
echo.

pause