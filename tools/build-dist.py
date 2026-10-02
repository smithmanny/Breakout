# Assemble dist/: the game files plus only the three.js addons the game imports (and their deps).
import re, os, shutil, glob, subprocess
root = 'vendor/three/jsm'
keep = {'.vercel', 'vercel.json'}
if os.path.isdir('dist'):
    for n in os.listdir('dist'):
        if n in keep: continue
        p = os.path.join('dist', n)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
else:
    os.makedirs('dist')
need = set()
for f in glob.glob('src/**/*.js', recursive=True):
    need |= {m for m in re.findall(r"three/addons/([A-Za-z0-9_./-]+\.js)", open(f).read())}
need, seen = list(need), set()
while need:
    f = need.pop()
    if f in seen: continue
    seen.add(f)
    for m in re.findall(r"from\s+['\"](\.[^'\"]+)['\"]", open(os.path.join(root, f)).read()):
        need.append(os.path.normpath(os.path.join(os.path.dirname(f), m)))
for f in seen:
    d = os.path.join('dist/vendor/three/jsm', f); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy(os.path.join(root, f), d)
os.makedirs('dist/vendor/three/build', exist_ok=True)
for f in ['three.module.js', 'three.core.js']: shutil.copy('vendor/three/build/' + f, 'dist/vendor/three/build/' + f)
for d in ['src', 'styles', 'assets']: shutil.copytree(d, 'dist/' + d)

# modulepreload: the boot imports modules in a chain (main -> menus -> character -> props ...), one network round trip per
# level. Listing the whole boot graph up front in index.html lets the browser fetch it in parallel (before minifying, so
# the import regexes see plain source).
IMP = re.compile(r"(?:\bfrom|\bimport)\s*['\"]([^'\"]+)['\"]")
def resolve(frm, spec):
    if spec == 'three': return 'vendor/three/build/three.module.js'
    if spec.startswith('three/addons/'): return 'vendor/three/jsm/' + spec[len('three/addons/'):]
    if spec.startswith('.'): return os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    return None
def deps(f):
    out = []
    for spec in IMP.findall(open(os.path.join('dist', f)).read()):
        r = resolve(f, spec)
        if r and os.path.exists(os.path.join('dist', r)): out.append(r)
    return out
main_src = open('dist/src/main.js').read()
roots = ['src/main.js'] + [os.path.normpath(os.path.join('src', m)) for m in re.findall(r"(?:import|loadModule)\(\s*'(\./[^']+)'", main_src) if 'dev/stubs' not in m]
order, stack = [], list(reversed(roots))
while stack:
    f = stack.pop()
    if f in order: continue
    order.append(f)
    stack.extend(reversed(deps(f)))
if 'vendor/three/build/three.core.js' not in order: order.insert(1, 'vendor/three/build/three.core.js')
html = open('index.html').read()
links = ''.join('<link rel="modulepreload" href="./%s">\n' % f for f in order)
html = html.replace('<link rel="stylesheet" href="styles/ui.css">', '<link rel="preload" href="styles/hud.css" as="style">\n<link rel="stylesheet" href="styles/ui.css">')   # ui.css @imports hud.css: fetch both at once
html = html.replace('<script type="module" src="./src/main.js"></script>', links + '<script type="module" src="./src/main.js"></script>')
open('dist/index.html', 'w').write(html)
print('dist ready:', len(seen), 'addon files,', len(order), 'preloaded modules')

# minify (per file, no bundling: the module graph and importmap stay as they are). Needs esbuild: uses a local one if
# installed, else fetches a pinned version with npx (like release-pages.sh does for wrangler); skipped if neither works.
def minify():
    files = glob.glob('dist/**/*.js', recursive=True) + glob.glob('dist/styles/*.css')
    local = 'node_modules/.bin/esbuild'
    cmd = [local] if os.path.exists(local) else ['npx', '--yes', 'esbuild@0.25.12']
    tmp = 'dist/.min'
    r = subprocess.run(cmd + files + ['--minify', '--format=esm', '--target=es2022', '--legal-comments=none', '--loader:.css=css', '--outbase=dist', '--outdir=' + tmp, '--log-level=error'], capture_output=True, text=True)
    if r.returncode: print('minify skipped:', (r.stderr or r.stdout).strip()[:200]); shutil.rmtree(tmp, ignore_errors=True); return
    before = after = 0
    for f in files:
        m = os.path.join(tmp, os.path.relpath(f, 'dist'))
        before += os.path.getsize(f); after += os.path.getsize(m); shutil.move(m, f)
    shutil.rmtree(tmp)
    print('minified %d files: %.0f KB -> %.0f KB' % (len(files), before / 1024, after / 1024))
if not os.environ.get('NO_MINIFY'): minify()
