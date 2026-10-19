import re
import urllib.parse
from sqlalchemy.engine.url import make_url

def normalize_database_url(url: str) -> str:
    if not url or url.startswith("sqlite"):
        return url

    url = url.strip().strip("\"'")

    match = re.match(r"^(postgres(?:ql)?(?:\+[a-zA-Z0-9_-]+)?):\/\/(.*)$", url)
    if not match:
        return url

    proto_prefix, body = match.groups()

    query_params = ""
    if "?" in body:
        body, query_params = body.split("?", 1)
        query_params = "?" + query_params

    path = ""
    if "/" in body:
        auth_host, path = body.split("/", 1)
        path = "/" + path
    else:
        auth_host = body

    port = None
    host = ""
    user = ""
    password = ""

    if "@" in auth_host:
        user_pass, host_port = auth_host.rsplit("@", 1)
        if ":" in user_pass:
            user, password = user_pass.split(":", 1)
            user = urllib.parse.unquote(user)
            password = urllib.parse.unquote(password)
        else:
            user = urllib.parse.unquote(user_pass)

        if ":" in host_port:
            host, port_str = host_port.split(":", 1)
            try:
                port = int(port_str)
            except ValueError:
                port = None
        else:
            host = host_port
    else:
        host = auth_host

    # Automatic Supabase IPv6 -> IPv4 Pooler translation:
    # Direct Supabase host 'db.<ref>.supabase.co' is IPv6-only.
    # AWS Lambda / Vercel Serverless Functions do not have outbound IPv6 routing.
    # We automatically route through the Supabase connection pooler with IPv4 support.
    supabase_match = re.match(r"^db\.([a-zA-Z0-9_-]+)\.supabase\.co$", host)
    if supabase_match:
        project_ref = supabase_match.group(1)
        # Sydney / ap-southeast-2 for project nqdcbhfmomoascbfbnef
        region = "ap-southeast-2"
        host = f"aws-0-{region}.pooler.supabase.com"
        port = port or 5432
        if not user.startswith("postgres."):
            user = f"postgres.{project_ref}"

    quoted_user = urllib.parse.quote(user, safe="")
    quoted_pass = urllib.parse.quote(password, safe="")
    new_auth = f"{quoted_user}:{quoted_pass}@" if password else f"{quoted_user}@"
    new_host_port = f"{host}:{port}" if port else host
    auth_host = f"{new_auth}{new_host_port}"

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
print("Normalized URL:", norm)
u = make_url(norm)
print("Host:", u.host)
print("Port:", u.port)
print("User:", u.username)
print("Pass:", u.password)
