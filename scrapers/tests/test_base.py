"""Tests unitarios de utilidades de scraping."""

from sites.base import empty_result, exponential_retry


def test_empty_result_shape():
    result = empty_result()
    assert "predictions" in result
    assert "suggestedAccumulators" in result
    assert result["predictions"] == []


def test_exponential_retry_success():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise RuntimeError("fail")
        return "ok"

    assert exponential_retry(flaky, max_attempts=3, waits=[0, 0, 0]) == "ok"
    assert calls["n"] == 2
