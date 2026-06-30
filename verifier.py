import re
import logging
import urllib.parse
from typing import List, Dict, Any, Optional
import requests

# Set up logging
logger = logging.getLogger("TruthLayer")

nlp_spacy = None

# Load spaCy
try:
    import spacy
    try:
        nlp_spacy = spacy.load("en_core_web_sm")
        logger.info("spaCy en_core_web_sm loaded successfully.")
    except Exception as e:
        logger.warning(f"spaCy model 'en_core_web_sm' not found. Exception: {e}")
except ImportError:
    logger.warning("spaCy is not installed.")

# English Stopwords
STOPWORDS = {
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", 
    "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", 
    "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", 
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", 
    "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", 
    "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", 
    "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", 
    "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", 
    "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", 
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", 
    "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now",
    "d", "ll", "m", "o", "re", "ve", "y", "ain", "aren", "couldn", "didn", "doesn", 
    "hadn", "hasn", "haven", "isn", "ma", "mightn", "mustn", "needn", "shan", "shouldn", 
    "wasn", "weren", "won", "wouldn"
}

# Domain keywords definitions for Domain Detection
DOMAIN_KEYWORDS = {
    "DBMS": [
        "dbms", "database", "sql", "primary key", "foreign key", "composite key", 
        "relational model", "nosql", "postgres", "mysql", "oracle", "acid properties", 
        "schema", "query", "queries", "table", "index", "normalization", "rdbms"
    ],
    "Networking": [
        "networking", "tcp", "udp", "ip address", "router", "switch", "packet", 
        "subnet", "dns", "http", "https", "protocol", "lan", "wan", "firewall", 
        "ethernet", "wifi", "ipv4", "ipv6", "dhcp", "ssh", "ssl", "tls"
    ],
    "Operating Systems": [
        "operating system", "kernel", "deadlock", "mutex", "semaphore", "thread", 
        "process scheduling", "virtual memory", "paging", "file system", "system call", 
        "bootloader", "ipc", "context switch", "monolithic", "microkernel"
    ],
    "Java": [
        "java", "jvm", "jdk", "jre", "spring boot", "garbage collection", "classloader", 
        "multithreading", "bytecode", "servlet", "hibernate", "maven", "gradle"
    ],
    "Python": [
        "python", "pip", "django", "flask", "numpy", "pandas", "list comprehension", 
        "decorator", "generator", "asyncio", "pep 8", "virtualenv", "poetry"
    ],
    "Machine Learning": [
        "machine learning", "deep learning", "neural network", "gradient descent", 
        "supervised learning", "unsupervised learning", "reinforcement learning", 
        "tensorflow", "pytorch", "overfitting", "transformer model", "nlp", 
        "cnn", "rnn", "llm", "regression", "classification", "clustering"
    ],
    "History": [
        "history", "empire", "dynasty", "treaty", "president", "king", "queen", 
        "revolution", "ancient", "medieval", "civil war", "century", "war", "monarch", 
        "historian", "archaeology", "colony", "independence"
    ],
    "Science": [
        "science", "biology", "chemistry", "physics", "molecule", "atom", "cell", 
        "gravity", "evolution", "element", "gene", "galaxy", "telescope", "space", 
        "organism", "chemical", "quantum", "thermodynamics"
    ],
    "Mathematics": [
        "math", "calculus", "algebra", "geometry", "theorem", "derivative", "integral", 
        "matrix", "vector", "equation", "probability", "statistics", "arithmetic", 
        "fraction", "function", "trigonometry", "proof"
    ],
    "Computer Architecture": [
        "computer architecture", "cpu", "gpu", "alu", "register", "assembly", 
        "instruction set", "pipelining", "logic gate", "ram", "rom", "von neumann", 
        "cache", "microarchitecture", "bus", "hardware"
    ]
}

def split_sentences_custom(text: str) -> List[str]:
    """Fallback custom sentence splitter that respects common abbreviations."""
    if not text.strip():
        return []
    
    tokens = text.strip().split()
    sentences = []
    current_sentence = []
    
    abbreviations = {
        "mr.", "mrs.", "dr.", "ms.", "prof.", "sr.", "jr.", "vs.", "gen.", "rep.", 
        "sen.", "st.", "inc.", "co.", "corp.", "ltd.", "jan.", "feb.", "mar.", "apr.", 
        "jun.", "jul.", "aug.", "sep.", "oct.", "nov.", "dec.", "e.g.", "i.e.", 
        "u.s.", "u.k.", "a.d.", "b.c.", "p.m.", "a.m."
    }
    
    for token in tokens:
        current_sentence.append(token)
        if token and token[-1] in {'.', '?', '!'}:
            token_lower = token.lower()
            if token_lower in abbreviations:
                continue
            stripped = token.rstrip('.!?')
            if len(stripped) == 1 and stripped.isupper():
                continue
            sentences.append(" ".join(current_sentence))
            current_sentence = []
            
    if current_sentence:
        sentences.append(" ".join(current_sentence))
        
    return sentences

def get_sentences(text: str) -> List[str]:
    """Split input text into sentences using spaCy or fallback custom rules."""
    if nlp_spacy:
        try:
            doc = nlp_spacy(text)
            return [sent.text.strip() for sent in doc.sents if sent.text.strip()]
        except Exception as e:
            logger.error(f"spaCy sentence splitting failed: {e}. Using fallback.")
            
    return split_sentences_custom(text)

def detect_domain(text: str) -> Optional[str]:
    """Detect the subject domain of the text using keyword matching."""
    text_lower = text.lower()
    scores = {domain: 0 for domain in DOMAIN_KEYWORDS}
    
    for domain, keywords in DOMAIN_KEYWORDS.items():
        for kw in keywords:
            # Look for keyword matches as whole phrases/words
            pattern = r'\b' + re.escape(kw) + r'\b'
            matches = len(re.findall(pattern, text_lower))
            scores[domain] += matches
            
    best_domain = None
    max_score = 0
    for domain, score in scores.items():
        if score > max_score:
            max_score = score
            best_domain = domain
            
    # Require at least one match to classify, otherwise return None (general)
    return best_domain if max_score > 0 else None

def get_keywords(sentence: str) -> List[str]:
    """Extract key entities and noun chunks using spaCy NER -> Noun chunks -> Regex fallback."""
    keywords = []
    
    if nlp_spacy:
        try:
            doc = nlp_spacy(sentence)
            
            # 1. Use spaCy NER first
            ner_entities = []
            for ent in doc.ents:
                ent_text = ent.text.strip()
                if len(ent_text) > 1 and ent_text not in ner_entities:
                    ner_entities.append(ent_text)
            
            keywords.extend(ner_entities)
            
            # 2. Fallback to noun chunks if we have fewer than 3 entities
            if len(keywords) < 3:
                for chunk in doc.noun_chunks:
                    clean_tokens = [t.text for t in chunk if t.text.lower() not in STOPWORDS and not t.is_punct]
                    chunk_text = " ".join(clean_tokens).strip()
                    if chunk_text and len(chunk_text) > 1 and chunk_text not in keywords:
                        keywords.append(chunk_text)
                        
        except Exception as e:
            logger.error(f"spaCy extraction failed: {e}. Using regex fallback.")
            
    # 3. Fallback to regex if we still have no keywords
    if not keywords:
        clean_text = re.sub(r"[^\w\s-]", "", sentence)
        words = clean_text.split()
        
        # Regex entities: Capitalized word sequences
        i = 0
        while i < len(words):
            word = words[i]
            if word and word[0].isupper() and word.lower() not in STOPWORDS:
                phrase = [word]
                while i + 1 < len(words) and words[i+1] and words[i+1][0].isupper() and words[i+1].lower() not in STOPWORDS:
                    phrase.append(words[i+1])
                    i += 1
                keywords.append(" ".join(phrase))
            i += 1
            
        # Fallback to any non-stopwords > 4 chars if still empty
        if not keywords:
            for word in words:
                if word.lower() not in STOPWORDS and len(word) > 4:
                    if word not in keywords:
                        keywords.append(word)
                        
    return keywords[:5]

def query_wikipedia_search(query_str: str, limit: int = 2) -> List[str]:
    """Search Wikipedia for titles matching query_str."""
    if not query_str.strip():
        return []
        
    search_url = "https://en.wikipedia.org/w/api.php"
    search_params = {
        "action": "query",
        "list": "search",
        "srsearch": query_str,
        "format": "json",
        "utf8": 1,
        "srlimit": limit
    }
    
    headers = {
        "User-Agent": "TruthLayerAI/1.0 (contact@truthlayer.ai)"
    }
    
    try:
        response = requests.get(search_url, params=search_params, headers=headers, timeout=5)
        response.raise_for_status()
        data = response.json()
        search_results = data.get("query", {}).get("search", [])
        return [result.get("title") for result in search_results if result.get("title")]
    except Exception as e:
        logger.error(f"Wikipedia search failed for '{query_str}': {e}")
        return []

def fetch_wikipedia_pages(titles: List[str]) -> List[Dict[str, Any]]:
    """Batch fetch extracts and full URLs for a list of Wikipedia titles."""
    if not titles:
        return []
        
    search_url = "https://en.wikipedia.org/w/api.php"
    headers = {
        "User-Agent": "TruthLayerAI/1.0 (contact@truthlayer.ai)"
    }
    
    # Wikipedia API titles are pipe-separated
    titles_str = "|".join(titles)
    query_params = {
        "action": "query",
        "prop": "extracts|info",
        "inprop": "url",
        "exintro": 1,
        "explaintext": 1,
        "titles": titles_str,
        "format": "json"
    }
    
    try:
        response = requests.get(search_url, params=query_params, headers=headers, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        pages = data.get("query", {}).get("pages", {})
        articles = []
        
        for pid, pdata in pages.items():
            title = pdata.get("title")
            extract = pdata.get("extract", "").strip()
            url = pdata.get("fullurl", f"https://en.wikipedia.org/?curid={pid}")
            
            if extract and title:
                articles.append({
                    "title": title,
                    "extract": extract,
                    "url": url
                })
        return articles
    except Exception as e:
        logger.error(f"Wikipedia batch fetch failed for titles '{titles}': {e}")
        return []

def query_wikipedia_multi(entities: List[str], domain: Optional[str] = None, limit_per_entity: int = 2) -> List[Dict[str, Any]]:
    """Search Wikipedia for multiple entities independently, batch fetches, and collects unique pages."""
    unique_titles = set()
    
    for entity in entities:
        # 1. Always search for the entity name itself
        titles = query_wikipedia_search(entity, limit=limit_per_entity)
        for t in titles:
            unique_titles.add(t)
            
        # 2. If a domain is detected, also search for domain-disambiguated title
        if domain and domain.lower() not in entity.lower() and len(entity.split()) <= 2:
            domain_query = f"{entity} {domain}"
            logger.info(f"Querying Wikipedia for domain-specific entity: '{domain_query}'")
            domain_titles = query_wikipedia_search(domain_query, limit=limit_per_entity)
            for t in domain_titles:
                unique_titles.add(t)
            
    if not unique_titles:
        return []
        
    # Batch fetch the extracts and URLs for all titles at once
    logger.info(f"Batch fetching extracts for {len(unique_titles)} titles: {list(unique_titles)}")
    return fetch_wikipedia_pages(list(unique_titles))
