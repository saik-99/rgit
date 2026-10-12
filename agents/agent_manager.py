# agents/agent_manager.py
# [PERSON 4: AI AGENT MANAGER DOMAIN]
# Manages agent workflow, prompt execution, and tool selection.

import json
from pathlib import Path
from agents.tools.search_tools import query_dataset

def run_agent(task_prompt: str, context: dict = None) -> dict:
    """
    Main agent execution entrypoint called by Person 1's backend.
    Takes a user query, plans steps, calls tools, and returns final answer.
    """
    print(f"[AgentManager] Processing task: {task_prompt}")
    
    # 1. Simulate agent tool reasoning
    tool_output = query_dataset(task_prompt)
    
    # 2. Synthesize final agent response
    response = {
        "status": "completed",
        "task_prompt": task_prompt,
        "thought_process": "Parsed task prompt, called query_dataset, and synthesized result.",
        "tool_executions": [tool_output],
        "final_answer": f"Agent successfully executed workflow for: '{task_prompt}'."
    }
    
    return response

if __name__ == "__main__":
    result = run_agent("Demo query for hackathon")
    print("Agent Result:", json.dumps(result, indent=2))
