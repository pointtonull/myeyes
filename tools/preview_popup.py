#!/usr/bin/env python3
"""Screenshot the MyEyes! popup by rendering it as a NORMAL web page.

FoxMCP can't high-res capture the extension's own moz-extension:// pages (no
content script on privileged pages). Work around it: inject a mock `chrome`
(+ a mock ExtensionData built from the real defaults, and getMessage backed by
the built locale) ahead of the popup bundle, serve build/debug/firefox over
HTTP so the popup renders as a plain page, and let FoxMCP shoot it full-res.

    python3 tools/preview_popup.py            # -> shots/popup_preview*.png
    python3 tools/preview_popup.py --out DIR --wait 3

Needs: a debug build (build/debug/firefox), the running FoxMCP Firefox, Pillow
(run with ~/.virtualenvs/p3/bin/python), and ~/bin/foxmcp.screenshot.
"""
import argparse
import http.server
import json
import os
import socket
import socketserver
import subprocess
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "..", "build", "debug", "firefox")
POPUP_HTML = os.path.join(BUILD, "ui", "popup", "index.html")
PREVIEW_NAME = "preview.html"

# --- mock ExtensionData, mirroring src/defaults.ts DEFAULT_SETTINGS -----------
THEME = {
    "mode": 1, "brightness": 100, "contrast": 100, "grayscale": 0, "sepia": 0,
    "useFont": False, "fontFamily": "Open Sans", "textStroke": 0,
    "engine": "dynamicTheme", "stylesheet": "",
    "darkSchemeBackgroundColor": "#181a1b", "darkSchemeTextColor": "#e8e6e3",
    "lightSchemeBackgroundColor": "#dcdad7", "lightSchemeTextColor": "#181a1b",
    "scrollbarColor": "", "selectionColor": "auto", "styleSystemControls": False,
    "lightColorScheme": "Default", "darkColorScheme": "Default", "immediateModify": False,
}
COLORSCHEME = {
    "light": {"Default": {"backgroundColor": "#dcdad7", "textColor": "#181a1b"}},
    "dark": {"Default": {"backgroundColor": "#181a1b", "textColor": "#e8e6e3"}},
}
SETTINGS = {
    "schemeVersion": 0, "enabled": True, "fetchNews": False, "theme": THEME,
    "presets": [], "customThemes": [], "enabledByDefault": True,
    "enabledFor": [], "disabledFor": [], "changeBrowserTheme": False,
    "syncSettings": True, "syncSitesFixes": False,
    "automation": {"enabled": False, "mode": "", "behavior": "OnOff"},
    "time": {"activation": "18:00", "deactivation": "9:00"},
    "location": {"latitude": None, "longitude": None},
    "previewNewDesign": True, "previewNewestDesign": False, "enableForPDF": True,
    "enableForProtectedPages": False, "enableContextMenus": False, "detectDarkTheme": True,
}
MOCK_DATA = {
    "isEnabled": True, "isReady": True, "isAllowedFileSchemeAccess": False,
    "settings": SETTINGS, "news": [], "shortcuts": {}, "colorScheme": COLORSCHEME,
    "forcedScheme": None,
    "activeTab": {"url": "https://example.com/", "id": 1, "documentId": "d1",
                  "isProtected": False, "isInjected": True, "isInDarkList": False,
                  "isDarkThemeDetected": False},
    "uiHighlights": [],
}

MOCK_SCRIPT = """
<style>html{{background:#16182e}}body{{margin:0 !important}}</style>
<script>
(function() {{
  var DATA = {data};
  var MSG = {{}};
  try {{ var x = new XMLHttpRequest();
    x.open('GET', '../../_locales/en/messages.json', false); x.send();
    MSG = JSON.parse(x.responseText); }} catch (e) {{}}
  function port(name) {{
    var ls = [];
    setTimeout(function() {{
      var d = (name && name.indexOf('devtools') >= 0) ? {{}} : DATA;
      ls.forEach(function(f) {{ f({{data: d}}); }});
    }}, 0);
    return {{name: name,
      onMessage: {{addListener: function(f) {{ ls.push(f); }}}},
      onDisconnect: {{addListener: function() {{}}}},
      postMessage: function() {{}}, disconnect: function() {{}}}};
  }}
  var mock = {{
    runtime: {{
      connect: function(o) {{ return port(o && o.name); }},
      sendMessage: function() {{}},
      onMessage: {{addListener: function() {{}}, removeListener: function() {{}}}},
      getURL: function(p) {{ return p; }}
    }},
    storage: {{local: {{get: function(o, cb) {{ cb && cb({{}}); }}}}}},
    i18n: {{
      getMessage: function(k) {{ return (MSG[k] && MSG[k].message) || ''; }},
      getUILanguage: function() {{ return 'en'; }}
    }}
  }};
  window.chrome = mock; window.browser = mock;
}})();
</script>
"""


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def write_preview():
    with open(POPUP_HTML, encoding="utf-8") as handle:
        html = handle.read()
    inject = MOCK_SCRIPT.format(data=json.dumps(MOCK_DATA))
    html = html.replace('<script src="index.js" defer></script>',
                        inject + '\n        <script src="index.js" defer></script>')
    path = os.path.join(BUILD, "ui", "popup", PREVIEW_NAME)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(html)
    return path


def serve(directory, port):
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=directory, **k)
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def crop_popup(png_path, bg=(0x16, 0x18, 0x2e), pad=6):
    """Crop the full-page shot tightly to the popup (its content bounding box)."""
    try:
        from PIL import Image, ImageChops
    except ImportError:
        return None
    im = Image.open(png_path).convert("RGB")
    diff = ImageChops.difference(im, Image.new("RGB", im.size, bg)).convert("L")
    bbox = diff.point(lambda p: 255 if p > 18 else 0).getbbox()
    if bbox:
        left, top, right, bottom = bbox
        im = im.crop((max(0, left - pad), max(0, top - pad),
                      min(im.width, right + pad), min(im.height, bottom + pad)))
    out = png_path.replace(".png", "_crop.png")
    im.resize((im.width * 2, im.height * 2), Image.LANCZOS).save(out)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="./shots", help="output directory (default: ./shots)")
    parser.add_argument("--wait", type=float, default=3.0, help="render wait before capture")
    args = parser.parse_args()

    if not os.path.exists(POPUP_HTML):
        raise SystemExit(f"no debug build at {POPUP_HTML} — run `npm run debug` first")

    out = os.path.abspath(os.path.expanduser(args.out))
    os.makedirs(out, exist_ok=True)
    preview = write_preview()
    port = free_port()
    httpd = serve(os.path.abspath(BUILD), port)
    try:
        url = f"http://127.0.0.1:{port}/ui/popup/{PREVIEW_NAME}"
        shot = os.path.join(out, "popup_preview.png")
        time.sleep(0.3)
        result = subprocess.run(
            [os.path.expanduser("~/bin/foxmcp.screenshot"), url,
             "--out", out, "--wait", str(args.wait), "--active"],
            check=True, capture_output=True, text=True,
        )
        produced = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ""
        if produced and os.path.exists(produced):
            os.replace(produced, shot)
        cropped = crop_popup(shot) if os.path.exists(shot) else None
        print(shot)
        if cropped:
            print(cropped)
    finally:
        httpd.shutdown()
        if os.path.exists(preview):
            os.remove(preview)


if __name__ == "__main__":
    main()
