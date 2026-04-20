"""
generate_test_signature.py

Utility for creating simple test signature images.
Useful for development / seeding when real scanned signatures are not yet available.

Usage:
    python generate_test_signature.py
    python generate_test_signature.py --name "Jane Doe" --out head_teacher_signature.png
"""

import argparse
import logging
import os
import sys

logger = logging.getLogger(__name__)


# Fonts to try in order before falling back to the PIL built-in bitmap font.
# Add any system-specific paths that make sense for your environment.
_FONT_CANDIDATES = [
    "DejaVuSans-Oblique.ttf",  # common on Linux
    "Arial Italic.ttf",  # macOS
    "arial.ttf",  # Windows / some Linux installs
    "FreeSansOblique.ttf",  # FreeFonts (Linux)
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansOblique.ttf",
    "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
    "C:\\Windows\\Fonts\\ariali.ttf",
]


def _load_font(size: int):
    """
    Try each candidate font in order and return the first one that loads.
    Falls back to PIL's built-in bitmap font with a warning if nothing works.
    """
    try:
        from PIL import ImageFont
    except ImportError:
        raise RuntimeError("Pillow is not installed. Run: pip install Pillow")

    for path in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except (IOError, OSError):
            continue

    logger.warning(
        "No TrueType font found — falling back to PIL default bitmap font. "
        "The signature image will look pixelated. Install DejaVu or Arial fonts "
        "on this system for better output."
    )
    return ImageFont.load_default()


def create_signature(
    text: str = "John Smith",
    filename: str = "test_signature.png",
    width: int = 400,
    height: int = 150,
    font_size: int = 40,
    text_color: str = "navy",
    line_color: str = "black",
    background: str = "white",
) -> str:
    """
    Create a simple test signature image and save it to *filename*.

    Parameters
    ----------
    text        : Name / text to render as the signature.
    filename    : Output file path (PNG recommended).
    width       : Canvas width in pixels.
    height      : Canvas height in pixels.
    font_size   : Point size of the signature text.
    text_color  : Colour of the signature text.
    line_color  : Colour of the underline.
    background  : Canvas background colour.

    Returns
    -------
    The absolute path of the saved file.
    """
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        raise RuntimeError("Pillow is not installed. Run: pip install Pillow")

    img = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(img)
    font = _load_font(font_size)

    # Centre the text vertically at ~55 % of the canvas height
    text_y = int(height * 0.30)
    draw.text((int(width * 0.10), text_y), text, fill=text_color, font=font)

    # Underline sits at 80 % of canvas height, with 8 % horizontal margins
    line_y = int(height * 0.80)
    margin = int(width * 0.08)
    draw.line([(margin, line_y), (width - margin, line_y)], fill=line_color, width=2)

    img.save(filename)
    abs_path = os.path.abspath(filename)
    logger.info("Test signature saved: %s", abs_path)
    return abs_path


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Generate a test signature image.")
    parser.add_argument("--name", default="John Smith", help="Signature text")
    parser.add_argument(
        "--out", default="teacher_signature.png", help="Output filename"
    )
    parser.add_argument("--width", type=int, default=400)
    parser.add_argument("--height", type=int, default=150)
    parser.add_argument("--font-size", type=int, default=40)
    args = parser.parse_args()

    path = create_signature(
        text=args.name,
        filename=args.out,
        width=args.width,
        height=args.height,
        font_size=args.font_size,
    )
    print(f"Signature saved → {path}")


if __name__ == "__main__":
    main()
