import sys
import os
import unittest

# Adjust Python path to import modules from the parent directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils import get_sentences, detect_domain, get_keywords
from verifier import map_similarity_to_score, calculate_sentence_similarity, using_embeddings

class TestTruthLayerBackend(unittest.TestCase):
    
    def test_get_sentences_basic(self):
        text = "Hello world. This is TruthLayer. It checks for hallucinations."
        sents = get_sentences(text)
        self.assertEqual(len(sents), 3)
        self.assertEqual(sents[0], "Hello world.")
        self.assertEqual(sents[1], "This is TruthLayer.")
        self.assertEqual(sents[2], "It checks for hallucinations.")

    def test_get_sentences_abbreviations(self):
        text = "Dr. Smith went to the U.S. to attend a conference. He returned at 5 p.m. yesterday."
        sents = get_sentences(text)
        # Even with custom splitter, it should avoid splitting on Dr., U.S., p.m.
        self.assertTrue(len(sents) <= 3)

    def test_detect_domain(self):
        # DBMS
        self.assertEqual(detect_domain("The primary key uniquely identifies a tuple in a database schema."), "DBMS")
        # Networking
        self.assertEqual(detect_domain("The router routes packets using TCP/IP protocols."), "Networking")
        # Operating Systems
        self.assertEqual(detect_domain("Deadlock can be avoided by breaking the circular wait condition in operating systems."), "Operating Systems")
        # General/None
        self.assertIsNone(detect_domain("The weather is nice today in Paris."))

    def test_get_keywords(self):
        sentence = "Einstein developed the general theory of relativity."
        keywords = get_keywords(sentence)
        self.assertTrue(len(keywords) > 0)
        # "Einstein" or "general theory of relativity" or similar should be extracted
        self.assertTrue(any("einstein" in kw.lower() or "relativity" in kw.lower() for kw in keywords))

    def test_map_similarity_to_score(self):
        # Bracket 1: Sim > 0.85 -> 95-100
        self.assertGreaterEqual(map_similarity_to_score(0.90), 95)
        # Bracket 2: Sim 0.70 - 0.85 -> 80-94
        self.assertTrue(80 <= map_similarity_to_score(0.75) <= 94)
        # Bracket 3: Sim 0.55 - 0.70 -> 60-79
        self.assertTrue(60 <= map_similarity_to_score(0.60) <= 79)
        # Bracket 4: Sim 0.40 - 0.55 -> 40-59
        self.assertTrue(40 <= map_similarity_to_score(0.45) <= 59)
        # Bracket 5: Else -> 0-39
        self.assertTrue(map_similarity_to_score(0.20) < 40)

    def test_calculate_sentence_similarity(self):
        sentence = "Python is a programming language."
        passages = ["Python is a popular programming language.", "Paris is the capital of France."]
        
        sims = calculate_sentence_similarity(sentence, passages)
        self.assertEqual(len(sims), 2)
        
        if using_embeddings:
            # First passage should have a much higher similarity than the unrelated second passage
            self.assertGreater(sims[0], sims[1])
            self.assertGreater(sims[0], 0.4)
        else:
            # If model is not loaded, it returns [0.0, 0.0]
            self.assertEqual(sims, [0.0, 0.0])

if __name__ == '__main__':
    unittest.main()
