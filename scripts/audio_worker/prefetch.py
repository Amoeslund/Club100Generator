"""Download every YouTube song in a mass-import list into the cache ahead of time.

Usage: python prefetch.py "<path to list.txt>" [workers]

Lines use the mass-import format (URL, optionally followed by a tab/comma and a title).
Lines that aren't YouTube URLs are reported and skipped.
"""
import re
import sys
from concurrent.futures import ThreadPoolExecutor

from main import ensure_cached, is_valid_youtube_url


def main(path, workers=4):
    entries = []
    for n, line in enumerate(open(path, encoding='utf-8'), 1):
        line = line.strip()
        if not line:
            continue
        url, *rest = re.split(r'\t|,|\s{2,}', line)
        title = ' '.join(r.strip() for r in rest if r.strip()) or url
        if is_valid_youtube_url(url):
            entries.append((n, url, title))
        else:
            print(f"skip line {n}: not a YouTube URL: {line}")

    failed = []

    def fetch(entry):
        n, url, title = entry
        try:
            ensure_cached(url)
            print(f"ok   {n:3d} {title}", flush=True)
        except Exception as e:
            failed.append((n, title, e))
            print(f"FAIL {n:3d} {title}: {e}", flush=True)

    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(fetch, entries))
    print(f"\n{len(entries) - len(failed)}/{len(entries)} cached")
    return 1 if failed else 0


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 4))
