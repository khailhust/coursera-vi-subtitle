"""
GlossaryManager — Quan ly thuat ngu chuyen nganh
Strategy: Dich binh thuong, sau do tim va thay the thuat ngu
trong ban dich dua tren mapping EN->VI.
"""

import json
import re
from pathlib import Path


class GlossaryManager:
    def __init__(self, glossary_dir: str = "glossaries"):
        self.glossary_dir = Path(glossary_dir)
        self.terms: dict[str, str] = {}  # {"neural network": "mang no-ron", ...}
        self.load_all()

    def load_all(self):
        """Load tat ca file glossary tu thu muc"""
        self.terms = {}
        if not self.glossary_dir.exists():
            return

        for f in self.glossary_dir.glob("*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                self.terms.update(data.get("terms", {}))
            except (json.JSONDecodeError, KeyError) as e:
                print(f"[Glossary] Loi doc {f.name}: {e}")

        # Sap xep theo do dai giam dan -> match cum dai truoc
        self.terms = dict(
            sorted(self.terms.items(), key=lambda x: len(x[0]), reverse=True)
        )
        print(f"[Glossary] Loaded {len(self.terms)} terms")

    def post_process(self, original_text: str, translated_text: str) -> str:
        """
        Tim thuat ngu EN trong original, thay the tuong ung trong translated.
        Strategy: Neu original chua thuat ngu EN -> kiem tra translated co
        dich dung khong, neu khong thi force-replace.
        """
        result = translated_text

        for en_term, vi_term in self.terms.items():
            # Kiem tra original co chua thuat ngu nay khong
            pattern = re.compile(re.escape(en_term), re.IGNORECASE)
            if not pattern.search(original_text):
                continue

            # Thuat ngu co trong original -> dam bao vi_term co trong output
            # Neu vi_term da co roi thi khong lam gi
            if vi_term.lower() in result.lower():
                continue

            # Them vi_term annotation vao cuoi (simple approach)
            # Hoac co the tim vi tri tuong ung de thay the
            # Simple: append note
            result = result.rstrip(".!?,;: ")
            result += f" ({vi_term})"
            break  # Chi them 1 annotation de tranh qua dai

        return result

    def apply_glossary(self, original_text: str, translated_text: str) -> str:
        """
        Post-process translation voi glossary.
        Kiem tra tung thuat ngu EN trong original,
        dam bao ban dich co thuat ngu VI tuong ung.
        Toi da 2 annotations de khong qua dai.
        """
        result = translated_text
        annotations_added = 0
        max_annotations = 2

        for en_term, vi_term in self.terms.items():
            if annotations_added >= max_annotations:
                break

            # Bo qua terms qua ngan (1 tu don) — model thuong dich dung
            if len(en_term.split()) <= 1 and len(en_term) < 6:
                continue

            # Kiem tra original co chua thuat ngu nay khong (case-insensitive)
            pattern = re.compile(r'\b' + re.escape(en_term) + r'\b', re.IGNORECASE)
            if not pattern.search(original_text):
                continue

            # Kiem tra xem vi_term da co trong translated chua
            if vi_term.lower() in result.lower():
                continue

            # Vi term chua co -> them vao cuoi ban dich
            result = result.rstrip(".")
            result += f" [{vi_term}]"
            annotations_added += 1

        return result

    def get_all_terms(self) -> dict[str, str]:
        """Tra ve tat ca terms"""
        return dict(self.terms)

    def add_term(self, en_term: str, vi_term: str) -> None:
        """Them hoac cap nhat 1 term"""
        self.terms[en_term] = vi_term
        # Re-sort
        self.terms = dict(
            sorted(self.terms.items(), key=lambda x: len(x[0]), reverse=True)
        )

    def save_to_file(self, filename: str = "custom.json") -> None:
        """Luu terms hien tai vao file"""
        filepath = self.glossary_dir / filename
        filepath.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "name": "Custom Glossary",
            "description": "User-defined terms",
            "terms": self.terms,
        }
        filepath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
