import logging
import unittest
from unittest.mock import Mock

from fastapi import HTTPException

from app.api.errors import log_stream_error, raise_internal_error


class ApiErrorsTest(unittest.TestCase):
    def test_raise_internal_error_preserves_public_detail_and_status(self) -> None:
        logger = Mock(spec=logging.Logger)
        error = RuntimeError("database password should not be exposed")

        with self.assertRaises(HTTPException) as raised:
            raise_internal_error(logger, error, "검색 처리 실패")

        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(raised.exception.detail, "검색 처리 실패")
        self.assertNotIn(str(error), str(raised.exception.detail))
        logger.exception.assert_called_once()

    def test_log_stream_error_does_not_return_exception_detail(self) -> None:
        logger = Mock(spec=logging.Logger)
        error = RuntimeError("private provider response")

        result = log_stream_error(logger, error, "search stream failed")

        self.assertIsNone(result)
        logger.exception.assert_called_once_with(
            "%s",
            "search stream failed",
            exc_info=error,
        )


if __name__ == "__main__":
    unittest.main()
