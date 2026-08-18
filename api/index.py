import os
import sys

# Make the backend package importable from this serverless function.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.main import app  # noqa: E402

# Vercel's Python runtime auto-detects an ASGI `app` object in this module.
