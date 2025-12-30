from typing import Optional

from langchain_google_genai import ChatGoogleGenerativeAI


def create_gemini_llm(
    model_name: str,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
) -> ChatGoogleGenerativeAI:
    """Create LLM instance for Explore agent.
    
    Uses LLM_MODEL for complex reasoning, SQL generation, and tool orchestration.
    """
    return ChatGoogleGenerativeAI(
        model=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
    )