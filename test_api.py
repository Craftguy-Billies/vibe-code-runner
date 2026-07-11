import json
import pytest
from flask.testing import FlaskClient
from typing import Any, Dict, List

from app import app


@pytest.fixture
def client() -> FlaskClient:
    """Create a test client for the Flask app."""
    with app.test_client() as client:
        yield client
    # Clean up in‑memory storage after each test
    from app import users, next_id
    users.clear()
    # Reset next_id (we need to access the module variable)
    import app as app_module
    app_module.next_id = 1


def test_health(client: FlaskClient) -> None:
    """Test the /health endpoint returns status healthy."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data: Dict[str, str] = resp.get_json()
    assert data == {"status": "healthy"}


def test_list_users_empty(client: FlaskClient) -> None:
    """Test that initially the user list is empty."""
    resp = client.get("/users")
    assert resp.status_code == 200
    data: Dict[str, List[Any]] = resp.get_json()
    assert data == {"users": []}


def test_create_user_valid(client: FlaskClient) -> None:
    """Test creating a user with valid name and email."""
    resp = client.post(
        "/users",
        data=json.dumps({"name": "Alice", "email": "alice@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    user: Dict[str, Any] = resp.get_json()
    assert user["name"] == "Alice"
    assert user["email"] == "alice@example.com"
    assert "id" in user
    assert isinstance(user["id"], int)

    # Verify it appears in the list
    resp2 = client.get("/users")
    users_list = resp2.get_json()["users"]
    assert len(users_list) == 1
    assert users_list[0] == user


def test_create_user_invalid_no_name(client: FlaskClient) -> None:
    """Test that missing name returns 400."""
    resp = client.post(
        "/users",
        data=json.dumps({"email": "bob@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data


def test_create_user_invalid_no_email(client: FlaskClient) -> None:
    """Test that missing email returns 400."""
    resp = client.post(
        "/users",
        data=json.dumps({"name": "Bob"}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data


def test_create_user_invalid_bad_email(client: FlaskClient) -> None:
    """Test that email without '@' returns 400."""
    resp = client.post(
        "/users",
        data=json.dumps({"name": "Charlie", "email": "not-an-email"}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data


def test_get_user_existing(client: FlaskClient) -> None:
    """Test retrieving an existing user by id."""
    # Create a user first
    create_resp = client.post(
        "/users",
        data=json.dumps({"name": "Diana", "email": "diana@example.com"}),
        content_type="application/json",
    )
    created = create_resp.get_json()
    user_id = created["id"]

    get_resp = client.get(f"/users/{user_id}")
    assert get_resp.status_code == 200
    fetched = get_resp.get_json()
    assert fetched == created


def test_get_user_nonexistent(client: FlaskClient) -> None:
    """Test that requesting a non‑existent id returns 404."""
    resp = client.get("/users/99999")
    assert resp.status_code == 404
    data = resp.get_json()
    assert "error" in data
    assert "99999" in data["error"]
