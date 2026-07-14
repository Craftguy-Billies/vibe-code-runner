from flask import Flask, jsonify, request
from typing import List, Dict, Any, Tuple, Union

app: Flask = Flask(__name__)

# In‑memory storage
users: List[Dict[str, Any]] = []
next_id: int = 1


@app.route("/health", methods=["GET"])
def health() -> Tuple[Dict[str, str], int]:
    """Return a simple health‑check JSON response."""
    return jsonify({"status": "healthy"}), 200


@app.route("/users", methods=["GET"])
def list_users() -> Tuple[Dict[str, List[Dict[str, Any]]], int]:
    """Return the list of all stored users."""
    return jsonify({"users": users}), 200


@app.route("/users", methods=["POST"])
def create_user() -> Tuple[Dict[str, Any], int]:
    """Create a new user from JSON body {"name": ..., "email": ...}."""
    data: Dict[str, Any] = request.get_json(force=True, silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be valid JSON"}), 400

    # Validate name
    name: Any = data.get("name")
    if not name or not isinstance(name, str) or not name.strip():
        return jsonify({"error": "A non‑empty 'name' field is required"}), 400

    # Validate email
    email: Any = data.get("email")
    if not email or not isinstance(email, str) or "@" not in email:
        return jsonify({"error": "A valid 'email' field (containing '@') is required"}), 400

    global next_id
    user: Dict[str, Any] = {
        "id": next_id,
        "name": name.strip(),
        "email": email.strip(),
    }
    users.append(user)
    next_id += 1

    return jsonify(user), 201


@app.route("/users/<int:user_id>", methods=["GET"])
def get_user(user_id: int) -> Tuple[Dict[str, Any], int]:
    """Return a single user by its integer id, or 404."""
    for user in users:
        if user["id"] == user_id:
            return jsonify(user), 200
    return jsonify({"error": f"User with id {user_id} not found"}), 404


@app.errorhandler(404)
def not_found(error: Any) -> Tuple[Dict[str, str], int]:
    """Return a generic JSON 404 for undefined routes."""
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    app.run(debug=True)
