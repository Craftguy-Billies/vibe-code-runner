"""Flask web app with in-memory user management."""

from flask import Flask, request, jsonify, Response
from typing import Tuple, Any, Dict, List
import re

app = Flask(__name__)

# In-memory storage
users: List[Dict[str, Any]] = []
next_id: int = 1


def is_valid_email(email: str) -> bool:
    """Basic email validation using regex."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


@app.route('/health', methods=['GET'])
def health() -> Tuple[Response, int]:
    """Health check endpoint returning JSON status."""
    return jsonify({"status": "ok"}), 200


@app.route('/users', methods=['GET'])
def get_users() -> Tuple[Response, int]:
    """Return list of all users."""
    return jsonify(users), 200


@app.route('/users', methods=['POST'])
def create_user() -> Tuple[Response, int]:
    """
    Create a new user.

    Expects JSON with 'name' and 'email'.
    Validates both fields are present and non-empty.
    Returns created user with assigned id and 201 status.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    name = data.get('name')
    email = data.get('email')

    if not name or not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Name is required and must be a non-empty string"}), 400
    if not email or not isinstance(email, str) or not email.strip():
        return jsonify({"error": "Email is required and must be a non-empty string"}), 400
    if not is_valid_email(email.strip()):
        return jsonify({"error": "Email format is invalid"}), 400

    global next_id
    user = {
        "id": next_id,
        "name": name.strip(),
        "email": email.strip(),
    }
    users.append(user)
    next_id += 1
    return jsonify(user), 201


@app.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id: int) -> Tuple[Response, int]:
    """Return a single user by id, or 404 if not found."""
    for user in users:
        if user['id'] == user_id:
            return jsonify(user), 200
    return jsonify({"error": "User not found"}), 404


@app.errorhandler(404)
def not_found(error) -> Tuple[Response, int]:
    """Handle 404 errors with JSON response."""
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(400)
def bad_request(error) -> Tuple[Response, int]:
    """Handle 400 errors with JSON response."""
    return jsonify({"error": "Bad request"}), 400


if __name__ == '__main__':
    app.run(debug=True)
