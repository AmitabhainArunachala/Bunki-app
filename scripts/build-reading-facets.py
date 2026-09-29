"""Re-derive the shelf's browsing hints in place without re-minting any reading.

The mint and regrade paths attach them already (prototypes/corridor/tools/
reading_facets.py); run this only after changing that classifier.
"""
import json
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1] / 'prototypes/corridor/tools'
sys.path.insert(0, str(TOOLS))

from reading_facets import attach_reading_facets  # noqa: E402

if __name__ == '__main__':
    articles = TOOLS.parent / 'data/articles'
    index_path = articles / 'index.json'
    index = json.loads(index_path.read_text())
    attach_reading_facets(index, articles)
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
    print(f"Reading facets: {len(index['articles'])} articles")
