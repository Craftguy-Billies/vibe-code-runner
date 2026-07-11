"""Tests for the Flask user API."""

from typing import Any, Dict
import pytest
from app import app


@pytest.fixture
def client():
    """Create a test client for the Flask app."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        # Clear in‑memory storage before each test
        yield client


def test_health_endpoint(client) -> None:
    """Test /health returns status ok."""
    response = client.get('/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data == {"status": "ok"}


def test_get_users_empty(client) -> None:
    """Test GET /users returns empty list initially."""
    response = client.get('/users')
    assert response.status_code == 200
    data = response.get_json()
    assert data == []


def test_create_user_success(client) -> None:
    """Test creating a user with valid data."""
    payload: Dict[str, Any] = {"name": "Alice", "email": "alice@example.com"}
    response = client.post('/users', json=payload)
    assert response.status_code == 201
    data = response.get_json()
    assert "id" in data
    assert data["name"] == "Alice"
    assert data["email"] == "alice@example.com"

    # Verify user appears in list
    response = client.get('/users')
    assert len(response.get_json()) == 1


def test_create_user_missing_name(client) -> None:
    """Test creating a user without name returns 400."""
    response = client.post('/users', json={"email": "bob@example.com"})
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data


def test_create_user_missing_email(client) -> None:
    """Test creating a user without email returns 400."""
    response = client.post('/users', json={"name": "Bob"})
    assert response.status_code == 400
    assert "error" in response.get_json()


def test_create_user_invalid_email(client) -> None:
    """Test creating a user with invalid email returns 400."""
    response = client.post('/users', json={"name": "Charlie", "email": "not-an-email"})
    assert response.status_code == 400
    assert "error" in response.get_json()


def test_get_user_by_id(client) -> None:
    """Test retrieving a user by id."""
    # Create a user first
    create_resp = client.post('/users', json={"name": "Alice", "email": "alice@example.com"})
    user_id = create_resp.get_json()["id"]

    response = client.get(f'/users/{user_id}')
    assert response.status_code == 200
    data = response.get_json()
    assert data["id"] == user_id
    assert data["name"] == "Alice"


def test_get_user_not_found(client) -> None:
    """Test retrieving a non‑existent user returns 404."""
    response = client.get('/users/999')
    assert response.status_code == 404
    data = response.get_json()
    assert "error" in data
