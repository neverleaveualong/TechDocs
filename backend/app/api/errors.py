"""
============================================================
작성자   : 심우현
수정일자 : 2026-07-30
기능요약 : API 예외 기록 및 외부 오류 응답 생성
수정내용 : 내부 예외는 로그에 기록하고 공개 오류 메시지는 호출부에서 전달받도록 구성
변경이유 : API 응답에 내부 예외 상세가 노출되지 않도록 공통 처리
주의사항 : HTTP 오류의 상태 코드와 detail 필드 구조는 기존 계약을 유지
============================================================
"""

import logging
from typing import NoReturn

from fastapi import HTTPException


def raise_internal_error(
    logger: logging.Logger,
    exc: Exception,
    public_detail: str,
    *,
    status_code: int = 500,
) -> NoReturn:
    logger.exception("%s", public_detail, exc_info=exc)
    raise HTTPException(status_code=status_code, detail=public_detail) from exc


def log_stream_error(logger: logging.Logger, exc: Exception, context: str) -> None:
    logger.exception("%s", context, exc_info=exc)
