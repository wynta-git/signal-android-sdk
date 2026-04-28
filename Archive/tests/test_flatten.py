"""
Unit tests for flatten_properties function.

Tests cover:
- Scalar values
- Nested dictionaries
- Arrays/lists of scalars
- Arrays of objects
- Mixed nesting
- Depth limits
- Empty collections
- Edge cases
"""

import pytest
from worker.flatten import flatten_properties, _to_scalar_rows


class TestFlattenScalars:
    """Test flattening of simple scalar values."""
    
    def test_empty_dict(self):
        """Empty dict should return empty list."""
        result = flatten_properties({})
        assert result == []
    
    def test_single_scalar(self):
        """Single key-value scalar."""
        result = flatten_properties({"amount": 100})
        assert result == [("amount", 100)]
    
    def test_multiple_scalars(self):
        """Multiple scalar values."""
        result = flatten_properties({
            "amount": 100,
            "currency": "INR",
            "success": True
        })
        # Sort for deterministic comparison
        result_sorted = sorted(result)
        expected = sorted([
            ("amount", 100),
            ("currency", "INR"),
            ("success", True)
        ])
        assert result_sorted == expected
    
    def test_various_scalar_types(self):
        """Test different scalar types: int, float, str, bool, None."""
        props = {
            "int_val": 42,
            "float_val": 3.14,
            "str_val": "hello",
            "bool_val": True,
            "none_val": None
        }
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["int_val"] == 42
        assert result_dict["float_val"] == 3.14
        assert result_dict["str_val"] == "hello"
        assert result_dict["bool_val"] is True
        assert result_dict["none_val"] is None


class TestFlattenNestedDicts:
    """Test flattening of nested dictionaries."""
    
    def test_single_level_nesting(self):
        """Single level of dict nesting."""
        props = {"user": {"name": "john", "age": 30}}
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["user.name"] == "john"
        assert result_dict["user.age"] == 30
    
    def test_deep_nesting(self):
        """Multiple levels of dict nesting."""
        props = {
            "order": {
                "user": {
                    "profile": {
                        "name": "john"
                    }
                }
            }
        }
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["order.user.profile.name"] == "john"
    
    def test_mixed_nesting(self):
        """Mix of scalars and nested dicts."""
        props = {
            "client_id": "c1",
            "metadata": {
                "version": 1,
                "tags": {"source": "api"}
            }
        }
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["client_id"] == "c1"
        assert result_dict["metadata.version"] == 1
        assert result_dict["metadata.tags.source"] == "api"


class TestFlattenArrays:
    """Test flattening of arrays/lists."""
    
    def test_empty_array(self):
        """Empty array should emit empty string."""
        result = flatten_properties({"items": []})
        result_dict = dict(result)
        
        assert result_dict["items"] == ""
    
    def test_array_of_scalars(self):
        """Array containing scalar values."""
        result = flatten_properties({"tags": ["python", "fastapi", "async"]})
        result_dict = dict(result)
        
        assert result_dict["tags[0]"] == "python"
        assert result_dict["tags[1]"] == "fastapi"
        assert result_dict["tags[2]"] == "async"
    
    def test_array_of_numbers(self):
        """Array of numeric values."""
        result = flatten_properties({"scores": [10, 20, 30]})
        result_dict = dict(result)
        
        assert result_dict["scores[0]"] == 10
        assert result_dict["scores[1]"] == 20
        assert result_dict["scores[2]"] == 30
    
    def test_array_of_objects(self):
        """Array of dictionaries."""
        props = {
            "items": [
                {"id": 1, "price": 100},
                {"id": 2, "price": 200}
            ]
        }
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["items[0].id"] == 1
        assert result_dict["items[0].price"] == 100
        assert result_dict["items[1].id"] == 2
        assert result_dict["items[1].price"] == 200
    
    def test_nested_arrays(self):
        """Array within array (depth-limited)."""
        props = {
            "matrix": [
                [1, 2],
                [3, 4]
            ]
        }
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["matrix[0][0]"] == 1
        assert result_dict["matrix[0][1]"] == 2
        assert result_dict["matrix[1][0]"] == 3
        assert result_dict["matrix[1][1]"] == 4


class TestFlattenComplexStructures:
    """Test flattening of complex nested structures."""
    
    def test_e_commerce_event(self):
        """Real-world e-commerce event structure."""
        props = {
            "order_id": "ORD-123",
            "customer": {
                "id": "cust-1",
                "name": "John Doe",
                "email": "john@example.com"
            },
            "items": [
                {
                    "product_id": "P1",
                    "name": "Laptop",
                    "price": 999.99,
                    "qty": 1
                },
                {
                    "product_id": "P2",
                    "name": "Mouse",
                    "price": 29.99,
                    "qty": 2
                }
            ],
            "totals": {
                "subtotal": 1059.97,
                "tax": 100.00,
                "shipping": 10.00,
                "grand_total": 1169.97
            }
        }
        
        result = flatten_properties(props)
        result_dict = dict(result)
        
        # Check customer fields
        assert result_dict["customer.id"] == "cust-1"
        assert result_dict["customer.name"] == "John Doe"
        
        # Check items array
        assert result_dict["items[0].product_id"] == "P1"
        assert result_dict["items[0].price"] == 999.99
        assert result_dict["items[1].qty"] == 2
        
        # Check totals
        assert result_dict["totals.grand_total"] == 1169.97
    
    def test_deeply_nested_with_arrays(self):
        """Complex structure with nested dicts and arrays."""
        props = {
            "api_call": {
                "endpoint": "/orders",
                "metadata": {
                    "timestamps": ["2026-01-01", "2026-01-02"],
                    "regions": [
                        {"country": "IN", "city": "Mumbai"},
                        {"country": "US", "city": "NYC"}
                    ]
                }
            }
        }
        
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["api_call.endpoint"] == "/orders"
        assert result_dict["api_call.metadata.timestamps[0]"] == "2026-01-01"
        assert result_dict["api_call.metadata.regions[0].country"] == "IN"
        assert result_dict["api_call.metadata.regions[1].city"] == "NYC"


class TestDepthLimit:
    """Test behavior with max_depth limit."""
    
    def test_depth_limit_default_3(self):
        """Default depth limit is 3."""
        # Level 0: root
        # Level 1: "a"
        # Level 2: "b"
        # Level 3: "c"
        # Level 4: "d" -> should be cut off
        props = {"a": {"b": {"c": {"d": {"e": "value"}}}}}
        result = flatten_properties(props)
        result_dict = dict(result)
        
        # Should have a.b.c but not a.b.c.d
        assert ("a.b.c", {}) not in result or len(result) == 1
    
    def test_custom_depth_limit(self):
        """Custom depth limit."""
        props = {"a": {"b": {"c": {"d": "value"}}}}
        
        # With depth 2, should get a.b only
        result = flatten_properties(props, max_depth=2)
        result_dict = dict(result)
        
        # Shouldn't have keys deeper than a.b.c
        assert not any(k.startswith("a.b.c.d") for k in result_dict.keys())


class TestTuples:
    """Test handling of tuples (treated like lists)."""
    
    def test_tuple_of_scalars(self):
        """Tuples should be handled like lists."""
        props = {"coords": (10, 20, 30)}
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["coords[0]"] == 10
        assert result_dict["coords[1]"] == 20
        assert result_dict["coords[2]"] == 30
    
    def test_tuple_of_objects(self):
        """Tuple containing dicts."""
        props = {"points": ({"x": 1, "y": 2}, {"x": 3, "y": 4})}
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["points[0].x"] == 1
        assert result_dict["points[1].y"] == 4


class TestEdgeCases:
    """Test edge cases and unusual inputs."""
    
    def test_unicode_keys_and_values(self):
        """Unicode strings in keys and values."""
        props = {
            "name": "日本語",
            "emoji": "🚀",
            "中文": "Chinese text"
        }
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["name"] == "日本語"
        assert result_dict["emoji"] == "🚀"
        assert result_dict["中文"] == "Chinese text"
    
    def test_special_characters_in_keys(self):
        """Keys with dots, dashes, underscores."""
        props = {
            "user_id": 1,
            "email-verified": True,
            "phone.number": "123-456-7890"
        }
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["user_id"] == 1
        assert result_dict["email-verified"] is True
        assert result_dict["phone.number"] == "123-456-7890"
    
    def test_numeric_string_values(self):
        """Numeric values as strings (not converted)."""
        props = {
            "amount_str": "1000",
            "amount_num": 1000,
            "zip_code": "12345"
        }
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["amount_str"] == "1000"
        assert result_dict["amount_num"] == 1000
        assert result_dict["zip_code"] == "12345"
    
    def test_large_array(self):
        """Large array with many items."""
        props = {"numbers": list(range(100))}
        result = flatten_properties(props)
        result_dict = dict(result)
        
        assert result_dict["numbers[0]"] == 0
        assert result_dict["numbers[50]"] == 50
        assert result_dict["numbers[99]"] == 99
        assert len(result) == 100


class TestKeyGeneration:
    """Test correct key generation formats."""
    
    def test_key_format_nested_dict(self):
        """Verify dotted notation for nested dicts."""
        props = {"a": {"b": "value"}}
        result = flatten_properties(props)
        
        assert any(k == "a.b" for k, v in result)
    
    def test_key_format_array_scalar(self):
        """Verify bracket notation for array items."""
        props = {"items": ["a"]}
        result = flatten_properties(props)
        
        assert any(k == "items[0]" for k, v in result)
    
    def test_key_format_array_dict(self):
        """Verify mixed notation for nested dict in array."""
        props = {"items": [{"name": "test"}]}
        result = flatten_properties(props)
        
        assert any(k == "items[0].name" for k, v in result)


class TestDeterminism:
    """Test that flattening is deterministic."""
    
    def test_multiple_calls_same_result(self):
        """Multiple calls should produce same result."""
        props = {
            "z": 1,
            "a": 2,
            "m": {"x": 3, "b": 4}
        }
        
        result1 = flatten_properties(props)
        result2 = flatten_properties(props)
        
        # Sort to compare regardless of order
        assert sorted(result1) == sorted(result2)
