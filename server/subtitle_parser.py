"""
SubtitleParser — Server-side VTT/SRT parser
Logic tương tự subtitle-parser.js phía client
"""

import re
from dataclasses import dataclass


@dataclass
class SubtitleCue:
    start: float
    end: float
    original_text: str
    translated_text: str = ""


# Regex patterns
ARROW_REGEX = re.compile(r"-+\s*>+")
TIMESTAMP_LINE_REGEX = re.compile(
    r"\d{1,2}:\d{2}[:.,]\d{2,3}\s*-+\s*>+\s*\d{1,2}:\d{2}[:.,]\d{2,3}"
)


def time_to_seconds(time_str: str) -> float:
    """'00:01:23.456' hoặc '00:01:23,456' → 83.456"""
    time_str = time_str.replace(",", ".")
    parts = time_str.split(":")
    if len(parts) == 3:
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    if len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    return float(parts[0])


def fix_missing_blank_lines(content: str) -> str:
    """Chèn dòng trắng trước timestamp nếu thiếu"""
    lines = content.split("\n")
    fixed = []
    for i, line in enumerate(lines):
        if TIMESTAMP_LINE_REGEX.search(line) and i > 0:
            prev_line = lines[i - 1].strip()
            if prev_line and not re.match(r"^\d+$", prev_line):
                fixed.append("")
        fixed.append(line)
    return "\n".join(fixed)


def parse(content: str, fmt: str = "vtt") -> list[SubtitleCue]:
    """Parse VTT/SRT content → list of SubtitleCue"""
    # Chuẩn hóa
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    content = fix_missing_blank_lines(content)

    cues: list[SubtitleCue] = []
    blocks = re.split(r"\n\s*\n", content)

    for block in blocks:
        lines = block.strip().split("\n")
        time_line_idx = -1

        for i, line in enumerate(lines):
            if TIMESTAMP_LINE_REGEX.search(line):
                time_line_idx = i
                break

        if time_line_idx == -1:
            continue

        time_parts = ARROW_REGEX.split(lines[time_line_idx])
        if len(time_parts) < 2:
            continue

        start_str = time_parts[0].strip()
        end_str = time_parts[1].strip()
        text = " ".join(lines[time_line_idx + 1 :]).strip()

        if text and start_str and end_str:
            cues.append(
                SubtitleCue(
                    start=time_to_seconds(start_str),
                    end=time_to_seconds(end_str),
                    original_text=text,
                    translated_text=text,
                )
            )

    return cues
