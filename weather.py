"""Fetch weather data from wttr.in for a given city."""

import json
import urllib.request
import urllib.error
from typing import Optional


def fetch_weather(city: str) -> Optional[str]:
    """
    Fetch a short weather summary for the given city from wttr.in.

    Args:
        city: The name of the city (e.g. "London").

    Returns:
        A string with the weather summary, or None if an error occurs.
    """
    if not city.strip():
        return None

    url = f"https://wttr.in/{urllib.parse.quote(city)}?format=%C+%t"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = response.read().decode("utf-8").strip()
            if not data:
                return None
            return data
    except urllib.error.URLError:
        return None
    except urllib.error.HTTPError:
        return None
    except OSError:
        return None


def main() -> None:
    """Entry point when run as a script."""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python weather.py <city>")
        sys.exit(1)

    city = " ".join(sys.argv[1:])
    result = fetch_weather(city)
    if result is None:
        print(f"Could not fetch weather for '{city}'.")
        sys.exit(1)
    print(f"Weather in {city}: {result}")


if __name__ == "__main__":
    main()
