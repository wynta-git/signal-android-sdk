"""Serve client files over HTTP to avoid file:// CORS restrictions."""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map[".html"] = "text/html"

with http.server.HTTPServer(("", PORT), handler) as httpd:
    print(f"Serving PAM client at http://localhost:{PORT}/")
    print(f"  index     → http://localhost:{PORT}/index.html")
    print(f"  demo      → http://localhost:{PORT}/demo.html")
    print(f"  segments  → http://localhost:{PORT}/segments.html")
    print(f"  campaigns → http://localhost:{PORT}/campaigns.html")
    print(f"  admin     → http://localhost:{PORT}/admin.html")
    print("Press Ctrl+C to stop.")
    httpd.serve_forever()
