import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import modules from our rewritten backend
from utils import get_sentences, get_keywords, query_wikipedia_multi, detect_domain, nlp_spacy
from verifier import verify_sentence, calculate_sentence_similarity, using_embeddings

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TruthLayer")

app = FastAPI(
    title="TruthLayer API",
    description="Enterprise-grade AI Hallucination Detection Engine",
    version="2.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request and Response schemas
class VerificationRequest(BaseModel):
    text: str
    max_articles: Optional[int] = 3
    use_nlp: Optional[bool] = True

class SentenceResult(BaseModel):
    sentence: str
    score: int
    status: str  # "true", "uncertain", "false"
    keywords: List[str]
    source_title: Optional[str] = None
    source_url: Optional[str] = None
    source_extract: Optional[str] = None
    explanation: str

class VerificationResponse(BaseModel):
    overall_score: int
    sentence_count: int
    true_count: int
    uncertain_count: int
    false_count: int
    results: List[SentenceResult]

# ----------------- ENDPOINTS -----------------

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "using_embeddings": using_embeddings,
        "using_spacy": nlp_spacy is not None
    }

@app.post("/verify", response_model=VerificationResponse)
@app.post("/api/verify", response_model=VerificationResponse)
def verify_text(request: VerificationRequest):
    input_text = request.text.strip()
    if not input_text:
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")
        
    # Step 1: Split input into sentences
    sentences = get_sentences(input_text)
    if not sentences:
        raise HTTPException(status_code=400, detail="No sentences detected in the input.")
        
    # Step 2: Detect overall domain of the input text
    detected_text_domain = detect_domain(input_text)
    logger.info(f"Overall text domain detected: {detected_text_domain}")
    
    results = []
    total_score = 0
    true_count = 0
    uncertain_count = 0
    false_count = 0
    
    for sentence in sentences:
        # Step 3: Extract keywords/entities using NER -> Noun chunks -> Regex
        keywords = get_keywords(sentence)
        logger.info(f"Sentence: '{sentence}' -> Keywords: {keywords}")
        
        # Step 4: Detect domain for sentence, fallback to overall text domain
        sentence_domain = detect_domain(sentence) or detected_text_domain
        logger.info(f"Sentence domain: {sentence_domain}")
        
        # Step 5: Search Wikipedia per entity
        articles = query_wikipedia_multi(keywords, domain=sentence_domain)
        
        # Step 6: Rank Wikipedia pages and filter unrelated ones (similarity < 0.35)
        filtered_articles = []
        if articles:
            extracts = [art["extract"] for art in articles]
            similarities = calculate_sentence_similarity(sentence, extracts)
            
            ranked_articles = []
            for sim, art in zip(similarities, articles):
                # Ignore unrelated pages using a threshold of 0.35
                if sim >= 0.35:
                    ranked_articles.append((sim, art))
                    
            # Sort by similarity descending
            ranked_articles.sort(key=lambda x: x[0], reverse=True)
            filtered_articles = [art for sim, art in ranked_articles]
            logger.info(f"Wikipedia articles ranked. Kept {len(filtered_articles)} of {len(articles)} pages.")
            
        # Step 7: Verify sentence accuracy & generate explanations
        verification = verify_sentence(sentence, keywords, filtered_articles)
        
        status = verification["status"]
        if status == "true":
            true_count += 1
        elif status == "uncertain":
            uncertain_count += 1
        else:
            false_count += 1
            
        total_score += verification["score"]
        
        results.append(SentenceResult(
            sentence=sentence,
            score=verification["score"],
            status=status,
            keywords=keywords,
            source_title=verification["source_title"],
            source_url=verification["source_url"],
            source_extract=verification["source_extract"],
            explanation=verification["explanation"]
        ))
        
    overall_score = int(total_score / len(sentences)) if sentences else 0
    
    return VerificationResponse(
        overall_score=overall_score,
        sentence_count=len(sentences),
        true_count=true_count,
        uncertain_count=uncertain_count,
        false_count=false_count,
        results=results
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
