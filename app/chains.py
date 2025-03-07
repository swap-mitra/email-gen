import os
import re
import streamlit as st
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.exceptions import OutputParserException
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Chain:
    def __init__(self):
        # Try to get API key from Streamlit secrets first, then fall back to env variable
        api_key = st.secrets.get("GROQ_API_KEY", os.getenv("GROQ_API_KEY"))
        if not api_key:
            raise ValueError("GROQ_API_KEY not found in environment variables or Streamlit secrets")
            
        self.llm = ChatGroq(
            temperature=0, 
            groq_api_key=api_key, 
            model="deepseek-r1-distill-llama-70b"
        )

    def extract_jobs(self, cleaned_text):
        prompt_extract = PromptTemplate.from_template(
            """
            ### SCRAPED TEXT FROM WEBSITE:
            {page_data}
            ### INSTRUCTION:
            The scraped text is from the career's page of a website.
            Your job is to extract the job postings and return them in JSON format containing the following keys: `role`, `experience`, `skills` and `description`.
            Only return the valid JSON.
            ### VALID JSON (NO PREAMBLE):
            """
        )
        chain_extract = prompt_extract | self.llm
        res = chain_extract.invoke(input={"page_data": cleaned_text})
        try:
            json_parser = JsonOutputParser()
            res = json_parser.parse(res.content)
        except OutputParserException:
            raise OutputParserException("Context too big. Unable to parse jobs.")
        return res if isinstance(res, list) else [res]
    
    def remove_think(self, text):
        """
        Remove any chain-of-thought content enclosed in <think> ... </think> tags.
        """
        return re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    
    def write_mail(self, job, links):
        prompt_email = PromptTemplate.from_template(
            """
            ### JOB DESCRIPTION:
            {job_description}

            ### INSTRUCTION:
            You are Travis Bickle, a business development executive at XYZ. XYZ is an AI & Software Consulting company dedicated to facilitating
            the seamless integration of business processes through automated tools. 
            Over our experience, we have empowered numerous enterprises with tailored solutions, fostering scalability, 
            process optimization, cost reduction, and heightened overall efficiency. 
            Your job is to write a cold email to the client regarding the job mentioned above describing the capability of XYZ 
            in fulfilling their needs.
            Also add the most relevant ones from the following links to showcase Atliq's portfolio: {link_list}
            Remember you are Travis Bickle, BDE at XYZ.
            Do not provide any internal chain-of-thought, reasoning, or preamble; only provide the final email. 
            ### EMAIL (NO PREAMBLE):

            """
        )
        chain_email = prompt_email | self.llm
        res = chain_email.invoke({"job_description": str(job), "link_list": links})
        # Remove any <think> tags from the final response
        final_email = self.remove_think(res.content)
        return final_email