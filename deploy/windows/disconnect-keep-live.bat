@echo off
rem Ngat Remote Desktop nhung VAN GIU man hinh VPS hoat dong (OBS / LIVE Studio khong bi den hinh).
rem Chay bang quyen Administrator thay cho viec bam X dong cua so Remote Desktop.
net session >nul 2>&1 || (echo Can chay bang quyen Administrator: chuot phai -^> Run as administrator & pause & exit /b 1)
for /f "skip=1 tokens=3" %%s in ('query user %USERNAME%') do (
  %windir%\System32\tscon.exe %%s /dest:console
)
