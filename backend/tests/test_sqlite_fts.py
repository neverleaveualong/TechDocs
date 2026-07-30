import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine, text

from app.db.database import ensure_sqlite_fts_table


class SqliteFtsTest(unittest.TestCase):
    def test_repeated_initialization_preserves_existing_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "fts.db"
            db_engine = create_engine(f"sqlite:///{database_path}")

            ensure_sqlite_fts_table(db_engine)
            with db_engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO patent_fts (
                            application_number,
                            title,
                            abstract,
                            applicant_name,
                            register_status,
                            application_date,
                            ipc_number,
                            page_content
                        ) VALUES (
                            :application_number,
                            :title,
                            :abstract,
                            :applicant_name,
                            :register_status,
                            :application_date,
                            :ipc_number,
                            :page_content
                        )
                        """
                    ),
                    {
                        "application_number": "10-2024-000001",
                        "title": "기존 특허",
                        "abstract": "기존 검색 인덱스 데이터",
                        "applicant_name": "테스트 기관",
                        "register_status": "등록",
                        "application_date": "2024-01-01",
                        "ipc_number": "A01B",
                        "page_content": "검색 가능한 본문",
                    },
                )

            ensure_sqlite_fts_table(db_engine)

            with db_engine.connect() as conn:
                application_number = conn.execute(
                    text("SELECT application_number FROM patent_fts")
                ).scalar_one()

            self.assertEqual(application_number, "10-2024-000001")


if __name__ == "__main__":
    unittest.main()
