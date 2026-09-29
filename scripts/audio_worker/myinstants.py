import html
import re
import urllib.request
from urllib.parse import urlparse

from main import EFFECTS_DIR, EFFECTS_MAP, _get_cache_lock, add_custom_effect

# myinstants sits behind Cloudflare, which rejects requests without a browser-like User-Agent
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.myinstants.com/',
}
MAX_AUDIO_BYTES = 10 * 1024 * 1024


def _is_myinstants(url):
    host = (urlparse(url).hostname or '').lower()
    return urlparse(url).scheme == 'https' and (host == 'myinstants.com' or host.endswith('.myinstants.com'))


def _fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=20) as res:
        return res.read(MAX_AUDIO_BYTES + 1)


def import_myinstants(page_url):
    """Download the sound behind a myinstants instant page and register it as an effect.

    Returns (effect, created). Raises ValueError on bad input.
    """
    page_url = page_url.strip()
    if not _is_myinstants(page_url):
        raise ValueError('Not a myinstants.com link')
    m = re.search(r'/instant/([\w-]+)', urlparse(page_url).path)
    if not m:
        raise ValueError('Link must point to a myinstants instant page (/instant/...)')
    slug = m.group(1).lower()
    effect_id = 'mi_' + slug.replace('-', '_')
    # Serialize imports of the same instant so a double submit doesn't fetch and register it twice
    with _get_cache_lock(f'effect:{effect_id}'):
        if effect_id in EFFECTS_MAP:
            return EFFECTS_MAP[effect_id], False
        return _download_effect(page_url, slug, effect_id), True


def _download_effect(page_url, slug, effect_id):
    page = _fetch(page_url).decode('utf-8', 'ignore')
    audio = re.search(r'<meta\s+property="og:audio"\s+content="([^"]+)"', page)
    if not audio:
        raise ValueError('No og:audio tag found on the page')
    audio_url = html.unescape(audio.group(1))
    if not _is_myinstants(audio_url) or not audio_url.lower().endswith('.mp3'):
        raise ValueError(f'Unexpected audio URL: {audio_url}')
    title = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', page)
    name = html.unescape(title.group(1)) if title else slug
    name = re.sub(r'\s*-\s*Sound Button$', '', name)

    data = _fetch(audio_url)
    if len(data) > MAX_AUDIO_BYTES:
        raise ValueError('Audio file is too large')
    filename = f'mi-{slug}.mp3'
    (EFFECTS_DIR / filename).write_bytes(data)

    return add_custom_effect({'id': effect_id, 'name': name, 'audioUrl': f'/effects/{filename}'})
