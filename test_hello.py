import subprocess
import sys

def test_hello_output():
    result = subprocess.run([sys.executable, "hello.py"], capture_output=True, text=True)
    assert result.stdout.strip() == "Hello World", f"Expected 'Hello World', got '{result.stdout.strip()}'"
    assert result.returncode == 0, f"Expected return code 0, got {result.returncode}"
