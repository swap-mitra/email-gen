import pandas as pd
import chromadb
import uuid
import os


class Portfolio:
    def __init__(self, file_path="app/resource/my_portfolio.csv"):
        self.file_path = file_path
        self.data = pd.read_csv(file_path)
        
        # Check if we're running in Streamlit Cloud environment
        # If an environment variable is set to indicate we're in the cloud
        if os.environ.get('STREAMLIT_CLOUD', False):
            # Use in-memory client in cloud
            self.chroma_client = chromadb.Client()
        else:
            # Use persistent client locally
            self.chroma_client = chromadb.PersistentClient('vectorstore')
            
        self.collection = self.chroma_client.get_or_create_collection(name="portfolio")

    def load_portfolio(self):
        # Always re-load the portfolio for in-memory database
        # Clear existing data
        if self.collection.count() > 0:
            try:
                # Try to delete all existing documents
                # This might not be supported in all versions of chromadb
                self.collection.delete()
                # Re-create the collection
                self.collection = self.chroma_client.get_or_create_collection(name="portfolio")
            except:
                # If deletion fails, we'll just add on top
                pass
        
        # Load data
        for _, row in self.data.iterrows():
            self.collection.add(documents=row["Techstack"],
                              metadatas={"links": row["Links"]},
                              ids=[str(uuid.uuid4())])

    def query_links(self, skills):
        return self.collection.query(query_texts=skills, n_results=2).get('metadatas', [])