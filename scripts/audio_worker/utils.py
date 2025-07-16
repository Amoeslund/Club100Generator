import re
import subprocess
from pathlib import Path
from typing import Optional

def extract_youtube_id(url: str) -> Optional[str]:
    """Extract the YouTube video ID from a URL."""
    patterns = [
        r"(?:v=|youtu\.be/|youtube\.com/embed/)([\w-]{11})",
        r"youtube\.com/watch\?v=([\w-]{11})"
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None

def get_youtube_duration(url: str) -> int:
    """Get the duration of a YouTube video in seconds using yt-dlp."""
    cmd = ["yt-dlp", "--get-duration", url]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    duration_str = result.stdout.strip()
    parts = duration_str.split(":")
    if len(parts) == 3:
        h, m, s = map(int, parts)
        return h * 3600 + m * 60 + s
    elif len(parts) == 2:
        m, s = map(int, parts)
        return m * 60 + s
    else:
        return int(parts[0])