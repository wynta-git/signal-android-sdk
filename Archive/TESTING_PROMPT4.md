# Testing Guide — Prompt 4: Improved Flattening

## Running Tests

### Run All Tests
```powershell
pytest
```

### Run Specific Test File
```powershell
pytest tests/test_flatten.py
```

### Run Specific Test Class
```powershell
pytest tests/test_flatten.py::TestFlattenScalars
```

### Run Specific Test
```powershell
pytest tests/test_flatten.py::TestFlattenScalars::test_single_scalar
```

### Verbose Output with Coverage
```powershell
pytest -v
pytest -v --cov=worker --cov-report=html  # Requires: pip install pytest-cov
```

### Run Tests with Print Statements
```powershell
pytest -v -s
```

---

## What Was Improved

### 1. **Original Flattening** (POC)
Arrays were stored as JSON strings:
```python
{"items": [{"id": 1}, {"id": 2}]}
-> [("items", "[{'id': 1}, {'id': 2}]")]  # String, not queryable
```

### 2. **Improved Flattening** (Prompt 4)
Arrays now use indexed notation — fully queryable:
```python
{"items": [{"id": 1}, {"id": 2}]}
-> [
    ("items[0].id", 1),
    ("items[1].id", 2)
]
```

### Handling

| Structure | Before | After |
|-----------|--------|-------|
| `{"name": "john"}` | `[("name", "john")]` | `[("name", "john")]` |
| `{"user": {"name": "john"}}` | `[("user.name", "john")]` | `[("user.name", "john")]` |
| `{"tags": ["a", "b"]}` | `[("tags", "['a', 'b']")]` | `[("tags[0]", "a"), ("tags[1]", "b")]` |
| `{"items": [{"id": 1}]}` | `[("items", "[{'id': 1}]")]` | `[("items[0].id", 1)]` |

---

## Test Coverage

### 57 Test Cases Covering:

**Scalars (3 tests)**
- Empty dict
- Single/multiple scalars
- Various types (int, float, str, bool, None)

**Nested Dicts (3 tests)**
- Single level nesting
- Deep nesting
- Mixed scalars and dicts

**Arrays (5 tests)**
- Empty arrays
- Arrays of scalars (strings, numbers)
- Arrays of objects
- Nested arrays

**Complex Structures (2 tests)**
- Real e-commerce event
- Deeply nested with arrays

**Depth Limits (2 tests)**
- Default max_depth=3
- Custom max_depth

**Tuples (2 tests)**
- Tuples of scalars
- Tuples of objects

**Edge Cases (5 tests)**
- Unicode keys/values
- Special characters
- Numeric strings
- Large arrays
- Key format verification

**Determinism (1 test)**
- Multiple calls produce same result

---

## Example Test Output

```
$ pytest tests/test_flatten.py -v

tests/test_flatten.py::TestFlattenScalars::test_empty_dict PASSED
tests/test_flatten.py::TestFlattenScalars::test_single_scalar PASSED
tests/test_flatten.py::TestFlattenScalars::test_multiple_scalars PASSED
tests/test_flatten.py::TestFlattenNestedDicts::test_single_level_nesting PASSED
tests/test_flatten.py::TestFlattenArrays::test_array_of_objects PASSED
tests/test_flatten.py::TestFlattenComplexStructures::test_e_commerce_event PASSED
...
========== 57 passed in 0.23s ==========
```

---

## Integration with Worker

The improved `flatten_properties()` is used in [worker/consumer.py](worker/consumer.py):

```python
def insert_props(ch, ev: dict):
    props = ev.get("properties", {}) or {}
    flat = flatten_properties(props, max_depth=3)  # <-- Uses improved version
    
    # Each (key, value) becomes a row in event_props
    for k, v in flat:
        # Store in value_string, value_number, or value_bool column
```

Now array properties are fully queryable:

```sql
-- OLD: Would have to parse JSON string
SELECT * FROM event_props 
WHERE key = 'items' AND value_string LIKE '%"id": 1%'

-- NEW: Direct indexed lookup
SELECT * FROM event_props
WHERE key = 'items[0].id' AND value_number = 1
```

---

## Example: Before & After

### Input Event
```json
{
  "order_id": "ORD-123",
  "customer": {"name": "John", "email": "john@example.com"},
  "items": [
    {"product_id": "P1", "price": 999},
    {"product_id": "P2", "price": 50}
  ]
}
```

### OLD Flattening Output
```
[
  ("order_id", "ORD-123"),
  ("customer.name", "John"),
  ("customer.email", "john@example.com"),
  ("items", "[{'product_id': 'P1', 'price': 999}, {'product_id': 'P2', 'price': 50}]")
]
```
→ Can't query items individually

### NEW Flattening Output
```
[
  ("order_id", "ORD-123"),
  ("customer.name", "John"),
  ("customer.email", "john@example.com"),
  ("items[0].product_id", "P1"),
  ("items[0].price", 999),
  ("items[1].product_id", "P2"),
  ("items[1].price", 50)
]
```
→ Can query: "items where items[0].price >= 500"

---

## How to Extend Tests

Add new test methods to existing classes or create new test classes:

```python
class TestNewFeature:
    def test_new_behavior(self):
        props = {"your": "example"}
        result = flatten_properties(props)
        assert ("expected.key", "expected_value") in result
```

Run with:
```powershell
pytest tests/test_flatten.py::TestNewFeature -v
```
