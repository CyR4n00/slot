@echo off
echo ローカルサーバーを起動しています...
start http://localhost:8000
python -m http.server 8000
