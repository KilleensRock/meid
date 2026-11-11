"""Gzip every data file in place so the published artifact stays inside its
size budget. The front-end loader accepts either plain JSON or gzip bytes."""
import gzip, os, shutil

ROOT = os.environ.get('BENEFACTS_OUT', 'data')
before = after = 0
files = 0
for dirpath, _dirs, names in os.walk(ROOT):
    for n in names:
        if not n.endswith('.json') or n.startswith('_'):
            continue
        p = os.path.join(dirpath, n)
        before += os.path.getsize(p)
        with open(p, 'rb') as fi, gzip.open(p + '.gz', 'wb', compresslevel=9) as fo:
            shutil.copyfileobj(fi, fo)
        after += os.path.getsize(p + '.gz')
        os.remove(p)
        files += 1
print(files, 'files |', round(before / 1e6, 1), 'MB ->', round(after / 1e6, 1), 'MB',
      '(%d%%)' % round(100 * after / before))
