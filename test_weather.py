"""Tests for the weather module."""

import unittest
from unittest.mock import patch, MagicMock
from weather import fetch_weather


class TestFetchWeather(unittest.TestCase):
    """Test cases for fetch_weather."""

    @patch("weather.urllib.request.urlopen")
    def test_fetch_weather_success(self, mock_urlopen: MagicMock) -> None:
        """Test that a valid response returns the weather string."""
        mock_response = MagicMock()
        mock_response.read.return_value = b"Sunny +25°C"
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = fetch_weather("London")
        self.assertEqual(result, "Sunny +25°C")

    @patch("weather.urllib.request.urlopen")
    def test_fetch_weather_empty_response(self, mock_urlopen: MagicMock) -> None:
        """Test that an empty response returns None."""
        mock_response = MagicMock()
        mock_response.read.return_value = b""
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = fetch_weather("Nowhere")
        self.assertIsNone(result)

    @patch("weather.urllib.request.urlopen")
    def test_fetch_weather_http_error(self, mock_urlopen: MagicMock) -> None:
        """Test that an HTTP error returns None."""
        mock_urlopen.side_effect = __import__("urllib.error").HTTPError(
            "http://example.com", 404, "Not Found", {}, None
        )

        result = fetch_weather("InvalidCity")
        self.assertIsNone(result)

    @patch("weather.urllib.request.urlopen")
    def test_fetch_weather_url_error(self, mock_urlopen: MagicMock) -> None:
        """Test that a URL error returns None."""
        mock_urlopen.side_effect = __import__("urllib.error").URLError("no network")

        result = fetch_weather("AnyCity")
        self.assertIsNone(result)

    def test_fetch_weather_empty_city(self) -> None:
        """Test that an empty city returns None."""
        result = fetch_weather("")
        self.assertIsNone(result)

    def test_fetch_weather_whitespace_city(self) -> None:
        """Test that a whitespace-only city returns None."""
        result = fetch_weather("   ")
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
