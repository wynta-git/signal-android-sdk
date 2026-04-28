from __future__ import annotations

from typing import Any, Dict, Iterable, List, Tuple


def _to_scalar_rows(prefix: str, obj: Any, max_depth: int, depth: int) -> Iterable[Tuple[str, Any]]:
    """
    Flattens nested dicts and lists into dotted/indexed keys, only emits scalar values.
    
    Handles:
    - Nested dicts: key.subkey.field
    - Lists: key[0], key[1], key[0].field
    - Scalars: emitted directly
    - Depth limit: stops recursion at max_depth
    
    Examples:
        {"user": {"name": "john", "age": 30}} 
        -> [("user.name", "john"), ("user.age", 30)]
        
        {"items": [{"id": 1, "price": 100}, {"id": 2, "price": 200}]}
        -> [("items[0].id", 1), ("items[0].price", 100), ("items[1].id", 2), ("items[1].price", 200)]
    """
    if depth > max_depth:
        return

    if isinstance(obj, dict):
        # Recursively process dict values
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            yield from _to_scalar_rows(key, v, max_depth=max_depth, depth=depth + 1)
    
    elif isinstance(obj, list):
        # Process list items with index notation
        if not obj:
            # Empty list: emit as empty string value
            yield (prefix, "")
        else:
            for idx, item in enumerate(obj):
                key = f"{prefix}[{idx}]"
                yield from _to_scalar_rows(key, item, max_depth=max_depth, depth=depth + 1)
    
    elif isinstance(obj, tuple):
        # Treat tuples like lists
        if not obj:
            yield (prefix, "")
        else:
            for idx, item in enumerate(obj):
                key = f"{prefix}[{idx}]"
                yield from _to_scalar_rows(key, item, max_depth=max_depth, depth=depth + 1)
    
    else:
        # Scalar (string, number, bool, None)
        yield (prefix, obj)


def flatten_properties(props: Dict[str, Any], max_depth: int = 3) -> List[Tuple[str, Any]]:
    """
    Flatten a nested dict/list structure into scalars.
    
    Args:
        props: Dictionary to flatten
        max_depth: Maximum recursion depth (default 3)
    
    Returns:
        List of (key, value) tuples where value is always a scalar
    """
    rows = list(_to_scalar_rows("", props, max_depth=max_depth, depth=0))
    # Drop empty keys if any
    return [(k, v) for (k, v) in rows if k]
