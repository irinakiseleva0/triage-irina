# LLM vs Decision Model — Report

Support Triage App · AI Systems Integration & Operations · EPITA BCS S5 · Irina Kiseleva

## 1. Decision model research

Decision models (DM) do not generate text. They take a `state` (here: the ticket) and typed `questions`, and return one of the allowed options with a probability for each option. Output tokens are zero and the answer always has the right shape.

Options considered (October 2026):

| Provider | Model | Endpoint | Access | Usable for this project? |
|---|---|---|---|---|
| vLLM Semantic Router | Decision 3.0 (`vllm-sr/d3-*`) | `POST /v1/systemone` | free API key from decision.vllm-sr.ai | **Yes — selected** |
| OpenRouter | Jev (`typesafe/jev-1.13`) | `/api/v1/systemone` | input tokens charged | Paid |
| OpenAI | Decisions API (GPT-6 Luna) | `POST /v1/decisions` | public beta | Paid |
| TypeSafe AI | Jev (System One) | `POST /v1/systemone` | early access, signups paused | No access |
| Cloudflare / Perplexity / AWS | Clef, pplx-decider, Strands Decider | not confirmed / self-hosted | open weights | Would need self-hosting |

**Choice: `vllm-sr/d3-turbo` on decision.vllm-sr.ai.** It is free, it uses the same `/v1/systemone` contract as the category's original API, it only needs an API key, and the first test call worked from PowerShell. It is called with plain `fetch` (the OpenAI SDK does not cover this endpoint).

## 2. Integration strategy

The user selects the strategy on the Triage page and on the Smoke page:

| Strategy | Category + priority | Summary + suggested action |
|---|---|---|
| `llm` | Gemini (`gemini-3.6-flash`), prompt `triage-v2` | Gemini |
| `dm` | Decision model (`vllm-sr/d3-turbo`) | not generated (a DM cannot write) |
| `dm_llm` | Decision model | Gemini writes the text, given the DM decision (prompt `summary-v1`) |

Implementation:

- `lib/dm.ts`: DM client (fetch, timeout with AbortController, no retries). The response is validated with Zod: the choice must be one of our enums. Errors are mapped to the same statuses as the LLM path (429, 502, 504, 500).
- `lib/summary.ts`: LLM call that only writes `summary` and `suggested_action`, validated with Zod.
- `lib/strategy.ts`: one `runStrategy(ticket, strategy)` used by `/api/triage` and by the smoke runner.
- The question `criteria` are the decision guidance (same business rules as the LLM prompt: priority reflects business impact, not tone; how-to questions are `technical_bug`).
- The ticket text is untrusted: the DM can only answer with one of the given options, so an injected instruction cannot change the output format.
- Logging and `/admin` record the strategy and the model (`vllm-sr/d3-turbo + gemini-3.6-flash` for `dm_llm`).

## 3. Results

Smoke tests on the labelled 100-ticket set, random samples. All run files are in `runs/`.

| Strategy | Tickets OK | Category accuracy | Priority accuracy | Avg latency | Output tokens | Errors |
|---|---|---|---|---|---|---|
| `llm` (3 runs × 5 OK) | 15 | 12/15 = **80 %** | 11/15 = **73 %** | ~5.2–7.3 s | yes, + hidden reasoning | 11 `rate_limited` (free Gemini quota) |
| `dm` (2 runs) | 26 | 23/26 = **88 %** | 16/26 = **62 %** | **~0.2–0.4 s** (median), one outlier at 13.9 s | **0** | **0** |
| `dm_llm` | — | — | — | — | — | could not be measured: Gemini daily quota exhausted (all `rate_limited`) |

Single-ticket comparison (same ticket on the Triage page, all three gave `technical_bug / high`):

| | `llm` | `dm` | `dm_llm` |
|---|---|---|---|
| Total tokens | 938 (of which 601 hidden reasoning) | 309 (input only) | 1089 |
| DM confidence | — | category 100 %, priority 98 % | same |

Cost: the DM is free (`DM_INPUT_PRICE_PER_1M=0`). Gemini prices were not configured in `.env.local`, so LLM cost shows `n/a`; the token counts show the difference anyway.

## 4. Analysis

**Which mistakes repeat (confusion analysis):**

- DM category: all 3 category errors are the same confusion, **`account` → `technical_bug`** (TCK-10357, TCK-10385, TCK-10403). Access or permission problems are read as "something is broken".
- DM priority: **all 10 priority errors are over-estimations** (low → medium, medium → high). The DM never under-estimated. It seems to react to urgent wording, even though the criteria say "business impact, not tone".
- LLM: fewer priority errors, but the sample is small because of the rate limit.

**Speed and reliability.** The DM was about 20–30× faster (one pass, no generation loop) and had zero errors in 30 calls. The free Gemini tier hit its rate limit after 5 calls, then its daily quota. For a smoke test or high volume, this matters as much as accuracy.

**Cost.** Gemini spends most of its tokens on hidden reasoning (601 of 938 on one ticket), billed as output. The DM bills input only.

**What a DM cannot do.** It cannot write the summary or the suggested action. `dm` alone is therefore not a complete triage; `dm_llm` is.

**Bug found by the smoke test.** 12 of the 100 labelled tickets (all from the `chat` channel, including two prompt-injection tickets) have an empty subject. The request schema required a subject, so they were rejected with 400 without any model call. Fixed: the subject is now optional and the text sent to the model is the body alone when the subject is empty.

## 5. Conclusion: which model for which task

**Use the decision model for the category, the LLM for the text, and do not trust the DM's priority alone.** The DM classifies categories as well as or better than the LLM, 20–30× faster, at no cost and with no invalid output, but it systematically over-estimates priority and cannot write.

Next step (not implemented): use the DM confidence as a gate. If the priority confidence is below a threshold (for example 0.8), ask the LLM for the priority, or send the ticket to human review. Then re-run `dm_llm` and the `llm` baseline on the same sample when the Gemini quota resets, to compare on identical tickets.

## Limitations

- Small samples (15 LLM tickets, 26 DM tickets), random and not identical between strategies.
- `dm_llm` could not be evaluated because of the Gemini free-tier quota.
- Only one DM (`d3-turbo`) was tested; other `d3-*` sizes may behave differently.
- Vendor figures for decision models are early; these are our own measurements on our data.
