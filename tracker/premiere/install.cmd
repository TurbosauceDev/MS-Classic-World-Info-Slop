@echo off
rem MS Classic Markers: installs this Premiere Pro panel for the current Windows user.
rem Unsigned panels need Adobe's PlayerDebugMode flag; this sets it for CEP 9-13 (Premiere 2020 and later).
setlocal
set "DEST=%APPDATA%\Adobe\CEP\extensions\ms-classic-markers"
for %%v in (9 10 11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy /e /i /q /y "%~dp0." "%DEST%" >nul
echo Installed to %DEST%
echo Restart Premiere Pro, then open Window ^> Extensions ^> MS Classic Markers.
pause
