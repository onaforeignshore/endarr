def test_history_returns_events(api_client, db_session):
    import time

    from models.downloads import Download
    from models.grabs import Grab

    g1 = Grab(release_title="Movie A", arr_name="radarr", grabbed_at=time.time())
    g2 = Grab(release_title="Movie B", arr_name="radarr", grabbed_at=time.time())
    db_session.add_all([g1, g2])
    db_session.commit()

    d1 = Download(
        hash="hash1",
        grab_id=g1.id,
        name="Movie A",
        added_to_client_at=time.time(),
        import_completed_at=time.time(),
        deleted_at=time.time() + 100
    )
    d2 = Download(
        hash="hash2",
        grab_id=g2.id,
        name="Movie B",
        added_to_client_at=time.time(),
        import_completed_at=time.time()
    )
    db_session.add_all([d1, d2])
    db_session.commit()

    resp = api_client.get("/api/v1/history?apikey=test-key")
    assert resp.status_code == 200
    data = resp.json
    assert data["total"] >= 3
    keys = {"timestamp", "title", "arr_name", "indexer", "quality", "size", "type"}
    for item in data["items"]:
        assert set(item.keys()) == keys

def test_history_filter_by_type(api_client, db_session):
    import time

    from models.downloads import Download
    from models.grabs import Grab

    g = Grab(release_title="Test Filter", arr_name="sonarr", grabbed_at=time.time())
    db_session.add(g)
    db_session.commit()

    d = Download(
        hash="filter_hash",
        grab_id=g.id,
        name="Test Filter",
        added_to_client_at=time.time(),
        import_completed_at=time.time()
    )
    db_session.add(d)
    db_session.commit()

    resp = api_client.get("/api/v1/history?eventType=grab&apikey=test-key")
    assert resp.status_code == 200
    data = resp.json
    assert all(item["type"] == "grab" for item in data["items"])
