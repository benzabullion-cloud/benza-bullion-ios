from pathlib import Path

path = Path('App/public/index.html')
s = path.read_text()
old = 'Future lifetime price: $74.99 · Founder savings: $49.99'
new = 'Planned future lifetime price: $74.99 · Save $50 at launch'
count = s.count(old)
if count != 2:
    raise SystemExit(f'Expected 2 Founder value strings, found {count}')
s = s.replace(old, new)
path.write_text(s)
