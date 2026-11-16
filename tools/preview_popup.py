#!/usr/bin/env python3
"""Screenshot the MyEyes! popup by rendering it as a NORMAL web page.

FoxMCP can't high-res capture the extension's own moz-extension:// pages (no
content script on privileged pages). Work around it: inject a mock `chrome`
(+ a mock ExtensionData built from the real defaults, and getMessage backed by
the built locale) ahead of the popup bundle, serve build/debug/firefox over
HTTP so the popup renders as a plain page, and let FoxMCP shoot it full-res.

    python3 tools/preview_popup.py            # -> shots/popup_preview*.png
    python3 tools/preview_popup.py --out DIR --wait 3
    # named-themes states: mock data scenario + clicks before the capture
    python3 tools/preview_popup.py --scenario modified --click .me-card--theme --name theme_menu
    python3 tools/preview_popup.py --scenario named --click .me-default__value --name default_menu
    python3 tools/preview_popup.py --scenario named --click .me-card--theme \
        --click "text=New theme" --name save_as   # "text=…" clicks the button containing …
    # keyboard and pointer steps, for controls that are not buttons; edits to
    # settings are applied and shown (the mock plays the background's part)
    python3 tools/preview_popup.py --scenario named --click .me-card--theme \
        --click "text=More theme options" --click "key:.hue-range__handle--to|End" \
        --click "drag:.hue-range__handle--from|-60" --name hue_range

Needs: a debug build (build/debug/firefox), the running FoxMCP Firefox, Pillow
(run with ~/.virtualenvs/p3/bin/python), and ~/bin/foxmcp.screenshot.

Anyone else (no FoxMCP): `--serve` — or simply no ~/bin/foxmcp.screenshot —
skips the capture, serves the same page and prints its URL; open that in any
browser (or hand it to an agent's browser tool) and screenshot the popup, then
Ctrl-C. The scenario and --click steps still apply. See CONTRIBUTE.md.
"""
import argparse
import http.server
import json
import os
import signal
import socket
import socketserver
import subprocess
import sys
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
    "presets": [], "customThemes": [], "defaultThemeId": "default", "siteTweaks": [],
    "enabledByDefault": True,
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
    "settings": SETTINGS, "news": [], "colorScheme": COLORSCHEME,
    "shortcuts": {"addSite": "Alt+Shift+A", "cycleSiteTheme": "Alt+Shift+T"},
    "forcedScheme": None,
    "activeTab": {"url": "https://example.com/", "id": 1, "documentId": "d1",
                  "isProtected": False, "isInjected": True, "isInDarkList": False,
                  "isDarkThemeDetected": False},
    "uiHighlights": [],
}

SCENARIOS = ("plain", "named", "modified", "engine", "custom", "disabled", "enabled", "dark", "parked")


def mock_data(scenario="plain"):
    """MOCK_DATA for a scenario (example.com is the active tab):

    plain     no saved themes, site follows the built-in Dynamic default
    named     3 saved themes, site pinned to Night, default = Warm sepia
    modified  named + unsaved tweaks forked from Night (Custom lit, dot on Night)
    engine    site set to plain Filter+ (Filter+ card lit)
    custom    site has its own tweaks on the built-in default (Custom · Dynamic)
    disabled  MyEyes never darkens the site (Disabled pill)
    enabled   MyEyes always darkens the site (Enabled pill)
    dark      Auto on an already-dark page (Auto · already dark)
    parked    on Filter+ with Custom tweaks parked (Custom card: restore)
    """
    data = json.loads(json.dumps(MOCK_DATA))
    settings = data["settings"]
    if scenario == "engine":
        settings["customThemes"] = [
            {"url": ["example.com"], "kind": "engine", "theme": {**THEME, "engine": "cssFilter"}},
        ]
    if scenario == "custom":
        settings["customThemes"] = [
            {"url": ["example.com"], "baseId": "default", "theme": {**THEME, "contrast": 120, "sepia": 15}},
        ]
    if scenario == "disabled":
        settings["disabledFor"] = ["example.com"]
    if scenario == "enabled":
        settings["enabledFor"] = ["example.com"]
    if scenario == "dark":
        data["activeTab"]["isDarkThemeDetected"] = True
    if scenario == "parked":
        settings["customThemes"] = [
            {"url": ["example.com"], "kind": "engine", "theme": {**THEME, "engine": "cssFilter"}},
        ]
        settings["siteTweaks"] = [
            {"url": ["example.com"], "baseId": "default", "theme": {**THEME, "contrast": 120, "sepia": 15}},
        ]
    if scenario in ("named", "modified"):
        settings["presets"] = [
            {"id": "night", "name": "Night", "urls": ["example.com"],
             "theme": {**THEME, "brightness": 85, "contrast": 110}},
            {"id": "sepia", "name": "Warm sepia", "urls": [],
             "theme": {**THEME, "sepia": 35}},
            {"id": "reading", "name": "Reading", "urls": [],
             "theme": {**THEME, "engine": "cssFilter"}},
        ]
        settings["defaultThemeId"] = "sepia"
    if scenario == "modified":
        settings["customThemes"] = [
            {"url": ["example.com"], "baseId": "night",
             "theme": {**THEME, "brightness": 85, "contrast": 125, "sepia": 10}},
        ]
    return data


MOCK_SCRIPT = """
<style>html{{background:#15152f}}body{{margin:0 !important}}</style>
<script>
function meShowErr(msg, stack) {{
  var p = document.createElement('pre');
  p.style.cssText = 'color:#f88;white-space:pre-wrap;font-size:12px;padding:8px;position:relative;z-index:9';
  p.textContent = 'ERROR: ' + msg + '\\n' + (stack || '');
  (document.body || document.documentElement).appendChild(p);
}}
var _ce = console.error;
console.error = function() {{
  try {{ meShowErr('console.error: ' + Array.prototype.map.call(arguments, function(a) {{ return (a && a.stack) || String(a); }}).join(' ')); }} catch (e) {{}}
  return _ce.apply(console, arguments);
}};
window.addEventListener('error', function(e) {{ meShowErr(e.message || e.error, e.error && e.error.stack); }});
window.addEventListener('unhandledrejection', function(e) {{
  var r = e.reason || {{}}; meShowErr('UNHANDLED: ' + (r.message || r), r.stack);
}});
var CLICKS = {clicks};
function meClickTarget(sel) {{
  if (sel.indexOf('text=') === 0) {{
    var text = sel.slice(5);
    return Array.prototype.find.call(document.querySelectorAll('button'), function(b) {{
      return b.textContent.indexOf(text) >= 0;
    }});
  }}
  return document.querySelector(sel);
}}
window.addEventListener('load', function() {{
  CLICKS.forEach(function(sel, i) {{
    setTimeout(function() {{
      // "key:SELECTOR|Key" focuses SELECTOR and sends it a keydown for Key
      // (bubbling, like a real key press), e.g. "key:.dropdown__selected|Enter"
      if (sel.indexOf('key:') === 0) {{
        var parts = sel.slice(4).split('|');
        var target = document.querySelector(parts[0]);
        if (!target) {{ meShowErr('harness: nothing matches ' + parts[0]); return; }}
        target.focus();
        target.dispatchEvent(new KeyboardEvent('keydown', {{key: parts[1], bubbles: true, cancelable: true}}));
        return;
      }}
      // "drag:SELECTOR|DX" presses the pointer on SELECTOR's centre, moves it DX px
      // sideways (negative = left) and releases it, e.g. "drag:.hue-range__handle--to|-60"
      if (sel.indexOf('drag:') === 0) {{
        var dragParts = sel.slice(5).split('|');
        var dragEl = document.querySelector(dragParts[0]);
        if (!dragEl) {{ meShowErr('harness: nothing matches ' + dragParts[0]); return; }}
        var box = dragEl.getBoundingClientRect();
        var startX = box.left + box.width / 2, midY = box.top + box.height / 2;
        var dragDx = parseFloat(dragParts[1]);
        var fire = function(target, type, x) {{
          target.dispatchEvent(new PointerEvent(type, {{clientX: x, clientY: midY, button: 0,
            pointerType: 'mouse', bubbles: true, cancelable: true}}));
        }};
        fire(dragEl, 'pointerdown', startX);
        fire(window, 'pointermove', startX + dragDx / 2);
        fire(window, 'pointermove', startX + dragDx);
        fire(window, 'pointerup', startX + dragDx);
        return;
      }}
      var el = meClickTarget(sel);
      if (el) {{ el.click(); }} else {{ meShowErr('harness: nothing matches ' + sel); }}
    }}, 1200 + i * 400);
  }});
}});
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
  // Setting edits are applied to DATA and pushed back to the popup (as the
  // background does), so a key: or click step that edits a setting shows.
  var changeListeners = [];
  function applyMessage(msg) {{
    if (!msg || !DATA.settings) {{ return; }}
    if (msg.type === 'ui-bg-change-settings') {{
      Object.keys(msg.data || {{}}).forEach(function(k) {{ DATA.settings[k] = msg.data[k]; }});
    }} else if (msg.type === 'ui-bg-set-theme') {{
      DATA.settings.theme = Object.assign({{}}, DATA.settings.theme, msg.data);
    }} else {{
      return;
    }}
    setTimeout(function() {{
      changeListeners.forEach(function(f) {{ f({{type: 'bg-ui-changes', data: DATA}}); }});
    }}, 0);
  }}
  var mock = {{
    runtime: {{
      connect: function(o) {{ return port(o && o.name); }},
      sendMessage: function(msg) {{ applyMessage(msg); }},
      onMessage: {{
        addListener: function(f) {{ changeListeners.push(f); }},
        removeListener: function(f) {{ changeListeners = changeListeners.filter(function(x) {{ return x !== f; }}); }}
      }},
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


def write_preview(data=None, clicks=()):
    with open(POPUP_HTML, encoding="utf-8") as handle:
        html = handle.read()
    inject = MOCK_SCRIPT.format(data=json.dumps(data or MOCK_DATA), clicks=json.dumps(list(clicks)))
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


def crop_popup(png_path, bg=(0x15, 0x15, 0x2f), pad=6):
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
    im.resize((im.width * 2, im.height * 2), Image.Resampling.LANCZOS).save(out)
    return out


def main():
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--out", default="./shots", help="output directory (default: ./shots)")
    parser.add_argument("--wait", type=float, default=4.5,
                        help="render wait before capture (shorter waits sometimes catch text unpainted)")
    parser.add_argument("--scenario", choices=SCENARIOS, default="plain",
                        help="mock settings: no themes / named themes / unsaved changes")
    parser.add_argument("--click", action="append", default=[],
                        help="CSS selector (or text=…) to click after render, in order; repeatable")
    parser.add_argument("--name", default="popup_preview", help="output file stem")
    parser.add_argument("--build", help="a build dir to preview instead of this checkout's build/debug/firefox "
                                        "(e.g. a baseline worktree's, for before/after shots)")
    parser.add_argument("--serve", action="store_true",
                        help="don't capture: serve the preview and print its URL so any browser can "
                             "(the default when ~/bin/foxmcp.screenshot is missing); Ctrl-C stops it")
    args = parser.parse_args()

    global BUILD, POPUP_HTML
    if args.build:
        BUILD = os.path.abspath(os.path.expanduser(args.build))
        POPUP_HTML = os.path.join(BUILD, "ui", "popup", "index.html")
    if not os.path.exists(POPUP_HTML):
        raise SystemExit(f"no debug build at {POPUP_HTML} — run `npm run debug:watch` (or `npm run debug`) first")

    out = os.path.abspath(os.path.expanduser(args.out))
    os.makedirs(out, exist_ok=True)
    preview = write_preview(mock_data(args.scenario), args.click)
    port = free_port()
    httpd = serve(os.path.abspath(BUILD), port)
    try:
        url = f"http://127.0.0.1:{port}/ui/popup/{PREVIEW_NAME}"
        shot = os.path.join(out, f"{args.name}.png")
        shooter = os.path.expanduser("~/bin/foxmcp.screenshot")
        if args.serve or not os.path.exists(shooter):
            print(f"Preview ready: {url}", flush=True)
            print("Open it in any browser, screenshot the popup, then press Ctrl-C here "
                  "(or kill this process: both clean up).", flush=True)
            # a background job inherits "ignore SIGINT" from a non-interactive
            # shell, and SIGTERM would skip the cleanup below: catch both
            signal.signal(signal.SIGINT, lambda *_: sys.exit(0))
            signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
            while True:
                time.sleep(3600)
        time.sleep(0.3)
        result = subprocess.run(
            [shooter, url,
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
