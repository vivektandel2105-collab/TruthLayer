# TruthLayer – Real-Time AI Output Verifier Backend (New Version)

This is the enterprise-grade backend for **TruthLayer**, a real-time AI hallucination detection engine. It splits input text into semantic sentences, extracts key entities, performs domain-sensitive searches on the Wikipedia API, ranks pages semantically, compares sentences against passages using SentenceTransformers, and generates confidence scores with detailed explanations.

## Features

1. **Intelligent Entity & Keyword Extraction**: Uses spaCy NER first, falling back to noun chunks and then regex to isolate specific query terms.
2. **Domain Detection**: Automatically classifies the input text into one of 10 domains (DBMS, Networking, Operating Systems, Java, Python, Machine Learning, History, Science, Mathematics, Computer Architecture) to refine Wikipedia search queries.
3. **Multi-Source Semantic Verification**: Queries Wikipedia for each extracted entity independently and retrieves article summaries/introductory paragraphs.
4. **Semantic Similarity & Ranking**: Uses SentenceTransformers (`all-MiniLM-L6-v2`) to rank Wikipedia articles and discards unrelated pages (similarity < 0.35).
5. **Passage-Level Cosine Similarity**: Compares the input sentence against all sentences and paragraphs of the retrieved Wikipedia articles, using the highest passage-level similarity.
6. **Calibrated Confidence Scoring**: Maps semantic similarities to confidence scores (0-100) using custom brackets.
7. **Structured Concept Overlap Explanations**: Generates professional explanations highlighting key matched concepts (e.g. uniqueness, tuple identification) rather than generic text templates.

## Directory Structure

```text
TruthLayer_New/
├── main.py              # FastAPI Web API and endpoints
├── utils.py             # Domain detection, entity extraction, and Wikipedia retrieval utilities
├── verifier.py          # SentenceTransformer similarity scoring, calibration, and concept extraction
├── requirements.txt     # Python dependencies list
├── README.md            # Documentation and instructions
└── tests/
    └── test_backend.py  # Unit test suite verifying core components
```

## Installation & Setup

1. **Prerequisites**: Python 3.8+ is recommended.
2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Download spaCy language model**:
   ```bash
   python -m spacy download en_core_web_sm
   ```

## Running the API Server

Start the FastAPI backend with:
```bash
python main.py
```
By default, the server will start at `http://127.0.0.1:8000`.

### API Endpoints

- **GET `/health` or `/api/health`**
  Returns API health and initialization state for spaCy and SentenceTransformers.

- **POST `/verify` or `/api/verify`**
  Accepts a JSON payload:
  ```json
  {
    "text": "Water boils at 100 degrees Celsius under standard atmospheric pressure."
  }
  ```
  Returns detailed verification metrics and results for each sentence.

## Running Tests

Run the test suite to verify domain detection, keyword extraction, and similarity mappings:
```bash
python tests/test_backend.py
```
