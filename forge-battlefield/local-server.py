# Run the site on this computer:  python3 local-server.py   then open http://localhost:4173
# Unlike `python3 -m http.server`, this tells the browser never to keep old copies,
# so every refresh always shows the latest files.
import http.server, functools, os, sys
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
here = os.path.dirname(os.path.abspath(__file__))
print('Forge Olympics running at http://localhost:%d  (Ctrl+C to stop)' % port)
http.server.ThreadingHTTPServer(('', port), functools.partial(NoCache, directory=here)).serve_forever()
