"""
One-time helper: move the user-visible strings in package.json into package.nls.json
(VS Code's localization mechanism) and replace them with %key% references.

Re-running is safe: values that are already %key% references are left alone and
existing package.nls.json entries are kept.
"""
import json
import os
import re
import sys

root = os.path.join(os.path.dirname(__file__), '..')
pkg_path = os.path.join(root, 'package.json')
nls_path = os.path.join(root, 'package.nls.json')

raw = open(pkg_path, encoding='utf8', newline='').read()
crlf = '\r\n' in raw
pkg = json.loads(raw)
nls = json.load(open(nls_path, encoding='utf8')) if os.path.exists(nls_path) else {}

def ref(key, value):
    if isinstance(value, str) and re.fullmatch(r'%[^%]+%', value):
        return value
    nls.setdefault(key, value)
    return f'%{key}%'

c = pkg['contributes']
for cmd in c.get('commands', []):
    cmd['title'] = ref(f"command.{cmd['command']}.title", cmd['title'])
    if 'category' in cmd:
        cmd['category'] = ref('category.forge', cmd['category'])

for container in c.get('viewsContainers', {}).get('activitybar', []):
    container['title'] = ref(f"viewsContainer.{container['id']}.title", container['title'])

for views in c.get('views', {}).values():
    for v in views:
        v['name'] = ref(f"view.{v['id']}.name", v['name'])

for key, prop in c.get('configuration', {}).get('properties', {}).items():
    if 'description' in prop:
        prop['description'] = ref(f'config.{key}.description', prop['description'])
    if 'markdownDescription' in prop:
        prop['markdownDescription'] = ref(f'config.{key}.markdownDescription', prop['markdownDescription'])

conf = c.get('configuration', {})
if 'title' in conf:
    conf['title'] = ref('config.title', conf['title'])

for wt in c.get('walkthroughs', []):
    wid = wt['id']
    wt['title'] = ref(f'walkthrough.{wid}.title', wt['title'])
    wt['description'] = ref(f'walkthrough.{wid}.description', wt['description'])
    for step in wt['steps']:
        sid = step['id']
        step['title'] = ref(f'walkthrough.{wid}.{sid}.title', step['title'])
        step['description'] = ref(f'walkthrough.{wid}.{sid}.description', step['description'])

out = json.dumps(pkg, indent=2, ensure_ascii=False) + '\n'
open(pkg_path, 'w', encoding='utf8', newline='').write(out.replace('\n', '\r\n') if crlf else out)
open(nls_path, 'w', encoding='utf8', newline='').write(json.dumps(nls, indent=2, ensure_ascii=False, sort_keys=True) + '\n')
print(f'{len(nls)} strings in package.nls.json')
