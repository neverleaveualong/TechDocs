import unittest
from unittest.mock import MagicMock, patch

from app.repositories import query_log_repository


class QueryLogRepositoryTest(unittest.TestCase):
    @patch.object(query_log_repository, "QueryLog")
    @patch.object(query_log_repository, "session_scope")
    def test_saves_query_log_and_returns_id(self, session_scope, query_log):
        db = MagicMock()
        log_entry = MagicMock(id=42)
        session_scope.return_value.__enter__.return_value = db
        query_log.return_value = log_entry

        result = query_log_repository.save_query_log(
            query="검색 질의",
            answer="검색 답변",
            sources=[{"title": "특허"}],
            use_hybrid=True,
            elapsed_ms=123,
        )

        self.assertEqual(result, 42)
        query_log.assert_called_once_with(
            query="검색 질의",
            answer="검색 답변",
            sources=[{"title": "특허"}],
            search_mode="hybrid",
            response_time_ms=123,
        )
        db.add.assert_called_once_with(log_entry)
        db.commit.assert_called_once_with()

    @patch.object(query_log_repository, "session_scope")
    @patch.object(query_log_repository.logger, "exception")
    def test_returns_none_when_save_fails(self, logger_exception, session_scope):
        session_scope.return_value.__enter__.side_effect = RuntimeError("db unavailable")

        result = query_log_repository.save_query_log(
            query="검색 질의",
            answer="검색 답변",
            sources=[],
            use_hybrid=False,
            elapsed_ms=123,
        )

        self.assertIsNone(result)
        logger_exception.assert_called_once_with("Failed to save query log")


if __name__ == "__main__":
    unittest.main()
