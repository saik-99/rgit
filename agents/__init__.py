"""Person 4 - Incident Agent package. Backend imports from here."""
from agents.agent_manager import analyze_incident, run_agent


def run_social_agent(*args, **kwargs):
    """Social media agent (see agents/social_agent.py)."""
    from agents.social_agent import run_social_agent as _run
    return _run(*args, **kwargs)


__all__ = ["analyze_incident", "run_agent", "run_social_agent"]
