"""
Small helper to save the compiled graph's flow diagram as an image, once.
"""
import logging
import os

logger = logging.getLogger(__name__)


def save_graph_image(compiled_graph, path: str) -> None:
    """
    Save a PNG of the graph's structure to `path`, but only if it doesn't
    already exist. Safe to call on every startup - subsequent runs skip it.
    """
    if os.path.exists(path):
        return

    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        png_bytes = compiled_graph.get_graph().draw_mermaid_png()
        with open(path, "wb") as f:
            f.write(png_bytes)
        logger.info("Saved graph diagram to %s", path)
    except Exception as e:
        # draw_mermaid_png() calls out to mermaid.ink over the network -
        # don't let a failure there crash the agent, just skip it.
        logger.info("Skipped saving graph image: %s", e)
