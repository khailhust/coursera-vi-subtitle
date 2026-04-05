"""
TranslationEngine — Wrapper cho HuggingFace Transformers
Dùng MarianMT (Opus-MT) trực tiếp thay vì CTranslate2
vì CTranslate2 conversion gây lỗi repetition nghiêm trọng.
"""

from transformers import MarianMTModel, MarianTokenizer
import torch


class TranslationEngine:
    """Wrapper cho MarianMT translation models"""

    def __init__(self, engine_name: str, model_name: str):
        self.engine_name = engine_name
        self.model_name = model_name  # HuggingFace model ID
        self.model = None
        self.tokenizer = None
        self._loaded = False

    def load(self) -> bool:
        """Load model vao memory."""
        if self._loaded:
            return True

        try:
            print(f"[Translator] Loading {self.engine_name} ({self.model_name})...")
            self.tokenizer = MarianTokenizer.from_pretrained(self.model_name)
            self.model = MarianMTModel.from_pretrained(self.model_name)
            self.model.eval()  # Inference mode

            self._loaded = True
            print(f"[Translator] {self.engine_name} loaded successfully!")
            return True

        except Exception as e:
            print(f"[Translator] Failed to load {self.engine_name}: {e}")
            return False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def translate(self, text: str) -> str:
        """Dich 1 cau EN -> VI"""
        if not self._loaded:
            raise RuntimeError(f"{self.engine_name} not loaded")

        inputs = self.tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=256)
        with torch.no_grad():
            outputs = self.model.generate(**inputs, max_length=256, num_beams=2)
        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)

    def translate_batch(self, texts: list[str], batch_size: int = 32) -> list[str]:
        """Dich nhieu cau cung luc"""
        if not self._loaded:
            raise RuntimeError(f"{self.engine_name} not loaded")

        results = []
        total = len(texts)
        for i in range(0, total, batch_size):
            batch = texts[i : i + batch_size]
            print(f"[Translator] Batch {i // batch_size + 1}/{(total + batch_size - 1) // batch_size}: {len(batch)} sentences")
            inputs = self.tokenizer(
                batch, return_tensors="pt", padding=True, truncation=True, max_length=256
            )
            with torch.no_grad():
                outputs = self.model.generate(**inputs, max_length=256, num_beams=2)
            decoded = self.tokenizer.batch_decode(outputs, skip_special_tokens=True)
            results.extend(decoded)

        return results


# === Engine Registry ===
_engines: dict[str, TranslationEngine] = {}


def register_engine(name: str, model_name: str) -> None:
    """Dang ky engine (chua load model)"""
    _engines[name] = TranslationEngine(name, model_name)


def get_engine(name: str) -> TranslationEngine | None:
    """Lay engine theo ten"""
    return _engines.get(name)


def get_available_engines() -> list[dict]:
    """Danh sach engines da dang ky + trang thai"""
    return [
        {
            "name": e.engine_name,
            "loaded": e.is_loaded,
            "model_name": e.model_name,
        }
        for e in _engines.values()
    ]


def init_engines() -> None:
    """Khoi tao engines"""
    # Opus-MT EN->VI
    register_engine("opus-mt", "Helsinki-NLP/opus-mt-en-vi")
    print(f"[Translator] Registered {len(_engines)} engines: {list(_engines.keys())}")
