# Catalog LLM (Gemini / Groq)

Dedicated cheap model for **package_factory** + **explore_factory** + daily curator.

| Use | Key |
|-----|-----|
| Catalog author / improve | `GEMINI_API_KEY` or `GROQ_API_KEY` |
| Vero / core agents | `OPENAI_API_KEY` (unchanged, not used here) |

```bash
export GEMINI_API_KEY=...
export CATALOG_LLM_PROVIDER=gemini
export CATALOG_LLM_MODEL=gemini-2.5-flash

python -c "from supervisor.catalog_llm import catalog_llm_status; print(catalog_llm_status())"
python -m supervisor.package_factory.pipeline run --market GLOBAL --limit 3 --publish
```

Fallback order: Gemini → Groq → seed bank. Core OpenAI only if `CATALOG_LLM_ALLOW_CORE=1` (off by default).
