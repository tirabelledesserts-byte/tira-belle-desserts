import urllib.parse
import re
from sqlalchemy.engine.url import make_url

def normalize_database_url(url: str) -> str:
    if not url or url.startswith("sqlite"):
        return url

    url = url.strip().strip("\"'")

    match = re.match(r"^(postgres(?:ql)?(?:\+[a-zA-Z0-9_-]+)?):\/\/(.*)$", url)
    if not match:
        return url

    proto_prefix, body = match.groups()

    # Split query parameters if any
    query_params = ""
    if "?" in body:
        body, query_params = body.split("?", 1)
        query_params = "?" + query_params

    # Split database path
    path = ""
    if "/" in body:
        auth_host, path = body.split("/", 1)
        path = "/" + path
    else:
        auth_host = body

    # auth_host is user:password@host:port
    # A valid hostname can NEVER contain '@'. So the LAST '@' separates user:password from host:port
    if "@" in auth_host:
        user_pass, host_port = auth_host.rsplit("@", 1)
        if ":" in user_pass:
            user, password = user_pass.split(":", 1)
            # Unquote first to avoid double encoding, then quote
            user = urllib.parse.unquote(user)
            password = urllib.parse.unquote(password)
            quoted_user = urllib.parse.quote(user, safe="")
            quoted_pass = urllib.parse.quote(password, safe="")
            auth_host = f"{quoted_user}:{quoted_pass}@{host_port}"
        else:
            user = urllib.parse.unquote(user_pass)
            quoted_user = urllib.parse.quote(user, safe="")
            auth_host = f"{quoted_user}@{host_port}"

    # Driver selection
    driver = None
    for d in ["psycopg2", "psycopg", "pg8000"]:
        try:
            __import__(d)
            driver = d
            break
        except ImportError:
            pass

    if driver:
        final_proto = f"postgresql+{driver}"
    else:
        final_proto = "postgresql"

    final_url = f"{final_proto}://{auth_host}{path}{query_params}"

    if ("supabase" in final_url or "pooler" in final_url or "aws" in final_url) and "sslmode" not in final_url:
        sep = "&" if "?" in final_url else "?"
        final_url = f"{final_url}{sep}sslmode=require"

    return final_url

test_url = "postgresql://postgres:MyPass@30012003@db.nqdcbhfmomoascbfbnef.supabase.co:5432/postgres"
norm = normalize_database_url(test_url)
print("Normalized:", norm)
u = make_url(norm)
print("Parsed host:", u.host)
print("Parsed user:", u.username)
print("Parsed pass:", u.password)
print("Parsed port:", u.port)
print("Parsed database:", u.database)
