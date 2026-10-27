import sys
import socket
import urllib.request
import json
import uvicorn
from backend.config import HOST, PORT

def is_port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return False
        except OSError:
            return True

def check_existing_server(port: int) -> bool:
    for h in ("127.0.0.1", "localhost"):
        url = f"http://{h}:{port}/api/health"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "TiraBelle-Launcher/1.0"})
            with urllib.request.urlopen(req, timeout=1.5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    if data.get("app") == "TIRA Belle":
                        return True
        except Exception:
            continue
    return False

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    # Pre-flight check: is server already actively serving?
    if check_existing_server(PORT):
        print("=" * 72)
        print(f" [INFO] TIRA Belle Backend Server is ALREADY RUNNING on http://{HOST}:{PORT}!")
        print("=" * 72)
        print(f" - Storefront:       http://localhost:{PORT}/index.html")
        print(f" - Loyalty Tracker:  http://localhost:{PORT}/tracker.html")
        print(f" - Admin POS Panel:  http://localhost:{PORT}/admin.html")
        print(f" - API Swagger Docs: http://localhost:{PORT}/docs")
        print("=" * 72)
        sys.exit(0)

    print(f"Starting TIRA Belle Backend Server on http://{HOST}:{PORT}")
    print(f"Interactive Swagger API Docs: http://localhost:{PORT}/docs")
    try:
        from backend.main import app
        uvicorn.run(app, host=HOST, port=PORT, reload=False)
    except OSError as e:
        if getattr(e, "winerror", None) == 10048 or "10048" in str(e):
            print(f"\n[INFO] Port {PORT} was claimed by an active instance.")
            print(f"Access TIRA Belle at: http://localhost:{PORT}/index.html")
        else:
            raise e
