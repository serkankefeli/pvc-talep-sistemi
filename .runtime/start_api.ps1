$env:PYTHONPATH = 'C:\Users\kefel\PycharmProjects\pvc\backend\.venv\Lib\site-packages'
$env:DATABASE_URL = 'sqlite:///./pvc_requests.db'
$env:ADMIN_USERNAME = 'admin'
$env:ADMIN_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$5Q/8HtSXkAf1zRQS8VNclw$3zrqNrR3D/sEuqMwcaZpnyggc6/4T1hwR2mjzQgvego'
$env:JWT_SECRET = 'local-demo-jwt-secret-change-before-production-2026'
$env:CORS_ORIGINS = 'http://localhost:4200,http://127.0.0.1:4200'
$env:ADMIN_PANEL_BASE_URL = 'http://127.0.0.1:4200/admin'

Set-Location -LiteralPath 'C:\Users\kefel\PycharmProjects\pvc\backend'
& 'C:\Users\kefel\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
    -m uvicorn app.main:app --host 127.0.0.1 --port 8000 `
    *> 'C:\Users\kefel\PycharmProjects\pvc\.runtime\api.run.log'
