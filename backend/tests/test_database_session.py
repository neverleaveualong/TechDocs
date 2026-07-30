import unittest
from unittest.mock import MagicMock, patch

from app.db.database import session_scope


class DatabaseSessionTest(unittest.TestCase):
    @patch("app.db.database.SessionLocal")
    def test_closes_session_after_successful_scope(self, session_factory) -> None:
        db = MagicMock()
        session_factory.return_value = db

        with session_scope() as active_db:
            self.assertIs(active_db, db)

        db.rollback.assert_not_called()
        db.close.assert_called_once_with()

    @patch("app.db.database.SessionLocal")
    def test_rolls_back_and_closes_session_after_failure(self, session_factory) -> None:
        db = MagicMock()
        session_factory.return_value = db

        with self.assertRaisesRegex(RuntimeError, "transaction failed"):
            with session_scope():
                raise RuntimeError("transaction failed")

        db.rollback.assert_called_once_with()
        db.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
