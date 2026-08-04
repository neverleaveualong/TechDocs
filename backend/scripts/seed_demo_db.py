import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import SessionLocal, init_db
from app.models.claimlens import ClaimLensPatent, ClaimLensClaim, ClaimLensClaimElement

def seed_demo():
    init_db()
    db = SessionLocal()

    db.query(ClaimLensClaimElement).delete()
    db.query(ClaimLensClaim).delete()
    db.query(ClaimLensPatent).delete()
    db.commit()

    companies = [
        ("삼성전자주식회사", 420),
        ("주식회사 더존비즈온", 310),
        ("SK하이닉스 주식회사", 250),
        ("현대자동차주식회사", 180),
        ("LG전자 주식회사", 120),
    ]

    for applicant, count in companies:
        for i in range(count):
            patent = ClaimLensPatent(
                application_number=f"10-2024-{applicant[:2]}-{i+1000:04d}",
                title=f"{applicant} 데이터 수집 처리 장치 및 방법 {i+1}",
                applicant_name=applicant,
                register_status="등록",
            )
            db.add(patent)
            db.flush()

            # Add claims for 90% of patents
            if i % 10 != 0:
                claim = ClaimLensClaim(
                    patent_id=patent.id,
                    claim_number=1,
                    raw_text="제1항: 데이터 처리 모듈 및 신경망 학습부를 포함하는 장치.",
                    normalized_text="데이터 처리 모듈 및 신경망 학습부를 포함하는 장치",
                    is_independent=True,
                    status="active"
                )
                db.add(claim)
                db.flush()

                elem = ClaimLensClaimElement(
                    claim_id=claim.id,
                    element_order=1,
                    element_text="입력 데이터를 임베딩하여 유사도를 산출하는 학습부"
                )
                db.add(elem)

    db.commit()
    db.close()
    print("Demo DB seeding completed successfully!")

if __name__ == "__main__":
    seed_demo()
