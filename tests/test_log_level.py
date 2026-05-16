def test_get_log_level(api_client):
    resp = api_client.get("/api/v1/system/log-level?apikey=test-key")
    assert resp.status_code == 200
    assert "level" in resp.json

def test_set_log_level(api_client):
    resp = api_client.post(
        "/api/v1/system/log-level?apikey=test-key",
        json={"level": "DEBUG"}
    )
    assert resp.status_code == 200
    # reset to INFO after test
    api_client.post("/api/v1/system/log-level?apikey=test-key", json={"level": "INFO"})
