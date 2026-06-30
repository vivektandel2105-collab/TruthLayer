import re
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from sentence_transformers import SentenceTransformer

# Set up logging
logger = logging.getLogger("TruthLayer")

# Initialize SentenceTransformer
logger.info("Loading SentenceTransformer model 'all-MiniLM-L6-v2'...")
try:
    sentence_model = SentenceTransformer("all-MiniLM-L6-v2")
    using_embeddings = True
    logger.info("SentenceTransformer (all-MiniLM-L6-v2) loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load SentenceTransformer: {e}")
    sentence_model = None
    using_embeddings = False

def calculate_sentence_similarity(sentence: str, passages: List[str]) -> List[float]:
    """Calculate similarity between an input sentence and multiple retrieved passages."""
    if not using_embeddings or not sentence_model or not passages:
        return [0.0] * len(passages)
        
    try:
        # Encode sentence and passages
        embeddings = sentence_model.encode([sentence] + passages, convert_to_numpy=True)
        sentence_vec = embeddings[0]
        passage_vecs = embeddings[1:]
        
        similarities = []
        norm_s = np.linalg.norm(sentence_vec)
        
        for vec in passage_vecs:
            norm_p = np.linalg.norm(vec)
            if norm_s > 0 and norm_p > 0:
                sim = np.dot(sentence_vec, vec) / (norm_s * norm_p)
                similarities.append(float(sim))
            else:
                similarities.append(0.0)
        return similarities
    except Exception as e:
        logger.error(f"Error calculating transformer similarity: {e}")
        return [0.0] * len(passages)

def map_similarity_to_score(sim: float) -> int:
    """Map semantic cosine similarity to confidence score based on brackets:
    - Similarity > 0.85: 95–100
    - Similarity 0.70–0.85: 80–94
    - Similarity 0.55–0.70: 60–79
    - Similarity 0.40–0.55: 40–59
    - Else: 0–39
    """
    sim = max(0.0, min(1.0, sim))
    if sim > 0.85:
        score = 95 + int((sim - 0.85) / (1.0 - 0.85) * 5)
    elif sim >= 0.70:
        score = 80 + int((sim - 0.70) / (0.85 - 0.70) * 14)
    elif sim >= 0.55:
        score = 60 + int((sim - 0.55) / (0.70 - 0.55) * 19)
    elif sim >= 0.40:
        score = 40 + int((sim - 0.40) / (0.55 - 0.40) * 19)
    else:
        score = int(sim / 0.40 * 39)
        
    return max(0, min(100, score))

def extract_matched_concepts(sentence: str, passage: str) -> List[str]:
    """Identify matching concepts present in both the sentence and the source passage."""
    from utils import nlp_spacy, STOPWORDS
    matched = []
    passage_lower = passage.lower()
    
    if nlp_spacy:
        try:
            doc = nlp_spacy(sentence)
            # Try noun chunks
            for chunk in doc.noun_chunks:
                chunk_clean = " ".join([t.text for t in chunk if t.text.lower() not in STOPWORDS and not t.is_punct]).strip()
                if chunk_clean and chunk_clean.lower() in passage_lower:
                    if chunk_clean not in matched and len(chunk_clean) > 2:
                        matched.append(chunk_clean)
                        
            # Try individual nouns/proper nouns/adjectives
            for token in doc:
                if token.pos_ in ["NOUN", "PROPN", "ADJ"] and token.text.lower() not in STOPWORDS and not token.is_punct:
                    word = token.text
                    if word not in matched and not any(word in m for m in matched) and len(word) > 2:
                        if word.lower() in passage_lower:
                            matched.append(word)
        except Exception as e:
            logger.error(f"spaCy concept matching failed: {e}")
            
    if not matched:
        # Regex token matching fallback
        words = re.findall(r"\b\w+\b", sentence.lower())
        for w in words:
            if w not in STOPWORDS and len(w) > 3 and w in passage_lower:
                if w not in matched:
                    matched.append(w)
                    
    return matched[:5]

def verify_sentence(sentence: str, keywords: List[str], articles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Verify a sentence against a list of retrieved articles and compute truth scores and explanations."""
    if not articles:
        # No reference found at all
        concepts = keywords[:3]
        concepts_str = "\n".join([f"• {c}" for c in concepts]) if concepts else "• None"
        explanation = f"No matching Wikipedia articles found.\nSemantic similarity: 0%.\nKey concepts identified:\n{concepts_str}"
        return {
            "score": 0,
            "status": "false",
            "source_title": None,
            "source_url": None,
            "source_extract": None,
            "explanation": explanation
        }
        
    best_article = None
    best_passage = ""
    highest_sim = -1.0
    
    from utils import get_sentences
    
    # Process each article
    for article in articles:
        extract = article["extract"]
        # Split extract into passages (sentences and paragraphs)
        passages = get_sentences(extract)
        # Also include the full extract as a passage
        passages.append(extract)
        
        # Calculate similarities for all passages in this article
        similarities = calculate_sentence_similarity(sentence, passages)
        for sim, passage in zip(similarities, passages):
            if sim > highest_sim:
                highest_sim = sim
                best_article = article
                best_passage = passage
                
    # If no similarities could be computed
    if highest_sim < 0.0:
        highest_sim = 0.0
        best_article = articles[0]
        best_passage = best_article["extract"]
        
    score = map_similarity_to_score(highest_sim)
    
    # Determine Status
    if score >= 75:
        status = "true"
    elif score >= 35:
        status = "uncertain"
    else:
        status = "false"
        
    # Extract matched concepts
    matched_concepts = extract_matched_concepts(sentence, best_passage)
    concepts_formatted = "\n".join([f"• {c}" for c in matched_concepts])
    if not concepts_formatted:
        concepts_formatted = "• None"
        
    # Build explanation
    if status == "true":
        explanation = (
            f"Supported by Wikipedia article \"{best_article['title']}\".\n"
            f"Semantic similarity: {score}%.\n"
            f"Key matched concepts:\n{concepts_formatted}"
        )
    elif status == "uncertain":
        explanation = (
            f"Partially supported by Wikipedia article \"{best_article['title']}\".\n"
            f"Semantic similarity: {score}%.\n"
            f"Key matched concepts:\n{concepts_formatted}\n"
            f"Some specific claims could not be fully verified."
        )
    else:
        explanation = (
            f"Potential hallucination. Not supported by Wikipedia article \"{best_article['title']}\".\n"
            f"Semantic similarity: {score}%.\n"
            f"Key concepts matched: {', '.join(matched_concepts) if matched_concepts else 'None'}"
        )
        
    return {
        "score": score,
        "status": status,
        "source_title": best_article["title"],
        "source_url": best_article["url"],
        "source_extract": best_article["extract"],
        "explanation": explanation
    }
