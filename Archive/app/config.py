from __future__ import annotations

import json
import os
from typing import Dict, Tuple


class CanonicalEventMapper:
    """Manages canonical event mapping loaded from JSON config."""
    
    def __init__(self, config_path: str = "config/canonical_map.json"):
        """
        Initialize the mapper by loading the JSON config file.
        
        Args:
            config_path: Path to the canonical_map.json file
        """
        self.mapping: Dict[Tuple[str, str], str] = {}
        self.fallback_template = "custom.{event_name_lower}"
        
        self._load_config(config_path)
    
    def _load_config(self, config_path: str) -> None:
        """
        Load canonical event mappings from JSON file.
        
        Expected JSON format:
        {
            "mappings": [
                {"client_id": "c1", "event_name": "Deposit", "canonical_event": "money.deposit"},
                ...
            ],
            "fallback": "custom.{event_name_lower}"
        }
        """
        if not os.path.exists(config_path):
            print(f"[WARNING] Canonical mapping config not found at {config_path}")
            print("         Using default fallback only")
            return
        
        try:
            with open(config_path, "r") as f:
                config = json.load(f)
            
            # Load mappings
            for entry in config.get("mappings", []):
                client_id = entry.get("client_id")
                event_name = entry.get("event_name")
                canonical_event = entry.get("canonical_event")
                
                if client_id and event_name and canonical_event:
                    self.mapping[(client_id, event_name)] = canonical_event
                    print(f"[LOAD] Canonical map: ({client_id}, {event_name}) -> {canonical_event}")
            
            # Load fallback template (optional)
            fallback = config.get("fallback")
            if fallback:
                self.fallback_template = fallback
            
            print(f"[LOAD] Loaded {len(self.mapping)} canonical mappings from {config_path}")
        
        except json.JSONDecodeError as e:
            print(f"[ERROR] Failed to parse JSON config at {config_path}: {e}")
        except Exception as e:
            print(f"[ERROR] Failed to load config from {config_path}: {e}")
    
    def get_canonical_event(self, client_id: str, event_name: str) -> str:
        """
        Get the canonical event name for a (client_id, event_name) pair.
        
        Args:
            client_id: The client ID
            event_name: The raw event name
        
        Returns:
            The canonical event name
        """
        # Exact match lookup
        if (client_id, event_name) in self.mapping:
            return self.mapping[(client_id, event_name)]
        
        # Fallback: apply template
        return self.fallback_template.format(event_name_lower=event_name.lower())


# Global instance loaded at startup
_mapper: CanonicalEventMapper | None = None


def load_mapper(config_path: str = "config/canonical_map.json") -> CanonicalEventMapper:
    """Load or return the global canonical event mapper instance."""
    global _mapper
    if _mapper is None:
        _mapper = CanonicalEventMapper(config_path)
    return _mapper


def get_canonical_event(client_id: str, event_name: str) -> str:
    """
    Convenience function to get canonical event using the global mapper.
    
    Args:
        client_id: The client ID
        event_name: The raw event name
    
    Returns:
        The canonical event name
    """
    mapper = load_mapper()
    return mapper.get_canonical_event(client_id, event_name)
