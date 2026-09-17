@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Push TANGAZO to GitHub

echo.
echo  ============================================
echo   TANGAZO  -  push this project to GitHub
echo  ============================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo  Git is not installed on this PC.
  echo.
  echo  Download it from https://git-scm.com/download/win
  echo  Install it with all the default options, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".git" (
  echo  No git history found - starting one.
  git init -b main >nul 2>&1
  git add -A
  git -c user.name="Sam" -c user.email="samwelalex204@gmail.com" commit -m "TANGAZO v1.0.0" >nul 2>&1
)

git remote get-url origin >nul 2>&1
if not errorlevel 1 goto :haveremote

where gh >nul 2>&1
if errorlevel 1 goto :manual

echo  GitHub CLI found. It can create the repository for you.
echo.
set /p USEGH="  Create the repo automatically? (y/n): "
if /i not "!USEGH!"=="y" goto :manual

set /p VIS="  Private or public? (private/public) [private]: "
if "!VIS!"=="" set VIS=private
echo.
echo  Creating github.com/^<you^>/tangazo ...
gh repo create tangazo --!VIS! --source=. --remote=origin --push
if errorlevel 1 (
  echo.
  echo  That did not work. Falling back to the manual route.
  echo.
  goto :manual
)
goto :done

:manual
echo.
echo  Do this in your browser, it takes about 30 seconds:
echo.
echo    1. Go to  https://github.com/new
echo    2. Repository name:  tangazo
echo    3. Choose Private (you can switch it to Public later)
echo    4. Do NOT tick "Add a README" or any other file
echo    5. Click "Create repository"
echo    6. Copy the URL from the address bar
echo.
set /p REPOURL="  Paste the repository URL here: "
if "!REPOURL!"=="" (
  echo  No URL given. Nothing was pushed.
  pause
  exit /b 1
)
git remote add origin !REPOURL!
if errorlevel 1 (
  echo  Could not set that as the remote. Check the URL and try again.
  pause
  exit /b 1
)

:haveremote
echo.
echo  Pushing...
echo  ^(A browser or sign-in box may appear - that is GitHub asking who you are.^)
echo.
git branch -M main
git push -u origin main
if errorlevel 1 (
  echo.
  echo  The push failed. The usual reasons:
  echo    - the sign-in was cancelled
  echo    - the repository already has files in it  ^(then run: git pull --rebase origin main^)
  echo.
  pause
  exit /b 1
)

:done
echo.
echo  ============================================
echo   Done. Your code is on GitHub.
echo  ============================================
echo.
for /f "delims=" %%u in ('git remote get-url origin') do echo   %%u
echo.
echo  To get a downloadable TANGAZO.exe built by GitHub itself:
echo.
echo      git tag v1.0.0
echo      git push origin v1.0.0
echo.
echo  Wait about five minutes, then open the Releases page of your repo.
echo  The installer and the portable exe will be waiting there.
echo.
pause
