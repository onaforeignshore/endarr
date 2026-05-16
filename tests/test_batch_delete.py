def test_batch_delete_valid(api_client, db_session):
    from models.downloads import Download
    dl = Download(hash="to_delete", name="Test Torrent", added_to_client_at=0)
    db_session.add(dl)
    db_session.commit()

    resp = api_client.post(
        "/api/v1/torrents/batch?apikey=test-key",
        json={"hashes": ["to_delete"]}
    )
    assert resp.status_code == 200
    data = resp.json
    assert data["deleted_count"] == 1

def test_batch_delete_not_found(api_client):
    resp = api_client.post(
        "/api/v1/torrents/batch?apikey=test-key",
        json={"hashes": ["nonexistent"]}
    )
    assert resp.status_code == 200
    data = resp.json
    assert data["failed_count"] == 1
