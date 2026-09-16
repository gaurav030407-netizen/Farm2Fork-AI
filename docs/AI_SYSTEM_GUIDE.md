# Farm2Fork AI Assistant & Agricultural Decision Support System

## 1. System Architecture

The Farm2Fork AI subsystem delivers a dual-layer AI architecture designed for high availability, zero synthetic data, and role-tailored marketplace assistance.

```
                              React Client (Port 5000)
             [Floating "Ask Farm2Fork" Drawer]  &  [Market Price Assistant in /insights]
                                              │
                                              ▼
                             Node Express API Gateway (Port 3000)
                                 (/api/ai/* with optionalAuth)
                                              │
                                              ▼
                                FastAPI Backend (Port 8000)
                                 - Sliding-Window Rate Limiter (30 req/min)
                                 - Role & Bounded Context Sanitization
                                 - Deterministic Price Calculation Engine
                                 - Read-Only Safe Tool Dispatch
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
       Primary Provider: Gemini REST                       Fallback Provider: Local Ollama
    (Timeout: 20s, Max tokens: 1024)                     (Timeout: 20s, http://127.0.0.1:11434)
                    │                                                   │
                    └───────────┬───────────────────────────────────────┘
                                ▼
         Automatic Fallback on: Timeout / 429 / Provider Error / Missing Key
                                │
                                ▼
         Graceful Degraded State if Both Unavailable:
         "AI assistance is temporarily unavailable." (Application never crashes)
```

---

## 2. Key Security Guardrails

1. **Frontend Isolation**: Neither `GEMINI_API_KEY` nor internal Ollama endpoints are exposed to the browser. The frontend communicates solely with the backend gateway via `/api/ai/*`.
2. **Read-Only Assistant**: The assistant cannot modify database records, approve drivers, alter crop prices, or execute payments.
3. **Zero-Hallucination Agricultural Data**: The assistant will **never** invent crop prices, mandi names, or varieties. If verified data is missing, it honestly states:
   > *"Not enough verified market observations to provide a price estimate."*
4. **Crop vs. Variety Distinction**: The platform strictly enforces that **Crop ≠ Variety**. For example: Potato is a Crop; Kufri Jyoti and Kufri Pukhraj are Varieties. The system never labels a Crop name as a Variety.

---

## 3. Local Development with Ollama

Farm2Fork supports 100% offline, local AI assistance via [Ollama](https://ollama.ai).

### Prerequisites
1. Download and install Ollama from [ollama.ai](https://ollama.ai).
2. Pull the default recommended model:
   ```bash
   ollama pull llama3.2
   ```
   *(Or any compatible instruction-tuned model such as `mistral`, `qwen2.5`, etc.)*
3. Verify Ollama is running:
   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```

### Backend Environment Configuration
In `backend/.env`:
```bash
# Primary AI Provider
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

AI_TIMEOUT_SECONDS=20
AI_MAX_OUTPUT_TOKENS=1024
AI_MAX_REQUESTS_PER_MINUTE=30

# Local Ollama Fallback
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

### Running in Local-Only Mode
If you do not have a Gemini API key:
- Leave `GEMINI_API_KEY=` blank or set `AI_PROVIDER=ollama`.
- The Farm2Fork AI service will immediately utilize your local Ollama instance with zero external dependencies.

---

## 4. Agricultural Price Decision Support Engine

The Market Price Assistant uses a deterministic statistical pipeline:

$$\text{Official Observations} \longrightarrow \text{Statistical Calculations} \longrightarrow \text{AI Interpretation}$$

### Computed Metrics:
- **Latest Modal Price**: Most recent recorded modal arrival price ($\text{₹}/\text{quintal}$).
- **Recent Range & Median**: Minimum, maximum, and median modal prices across the selected period.
- **Trend Direction**: Computed via period segment averages:
  - $> +2\%$ $\rightarrow$ **Rising**
  - $< -2\%$ $\rightarrow$ **Falling**
  - Between $-2\%$ and $+2\%$ $\rightarrow$ **Stable / Mixed**
  - $< 3$ observations $\rightarrow$ **Insufficient data**
- **Farmer Asking Price Difference**: Absolute and percentage difference compared against the latest mandi modal reference.
- **Statistical Confidence**:
  - **High**: $\ge 30$ observations spanning $\ge 30$ days.
  - **Medium**: $\ge 10$ observations spanning $\ge 14$ days.
  - **Low**: $\ge 3$ observations.
  - **Insufficient Data**: $< 3$ observations.
- **Supported Historical Periods**: 2 Months (`2m`), 6 Months (`6m`), 1 Year (`1y`), 2 Years (`2y`), 5 Years (`5y`).

### Mandatory Output Disclaimer
All price decision support outputs conclude with:
> *"Market prices can change quickly based on arrival volumes, quality grade, and transport costs. This is decision support, not a guaranteed future price."*

---

## 5. Roadmap for Future Model Fine-Tuning

The current implementation utilizes strict system instructions combined with bounded tool retrieval. For future specialized agricultural model fine-tuning, the following structured pipeline is established:

```
[Verified Agmarknet Mandi Records]
                 +
[Completed Farm2Fork Transactions]
                 +
[Farmer & Buyer Anonymized Feedback]
                 +
[Seasonal Indian Agricultural Demand Patterns]
                 │
                 ▼
     [Curated JSONL Training Dataset]
                 │
                 ▼
   [Supervised Fine-Tuning (SFT)]
                 │
                 ▼
[Agricultural Benchmark Evaluation (Price accuracy, variety awareness, safety)]
```

1. **Data Curation Boundary**: Data must be extracted only from completed, verified transactions with personal identifiers, OTPs, and payment tokens scrubbed.
2. **Quality Validation**: Variations must be validated against the official catalog in `public.crops` and `public.crop_varieties`.
3. **Safety Evaluation**: Automated red-teaming to ensure fine-tuned models never hallucinate non-existent government minimum support prices (MSP) or guaranteed purchase rates.
