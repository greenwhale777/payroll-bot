import { Request, Response, NextFunction } from 'express';

/**
 * API 키 인증 미들웨어
 * 요청 헤더의 x-api-key와 환경변수 API_SECRET_KEY를 비교
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const secretKey = process.env.API_SECRET_KEY;

  if (!secretKey) {
    // API_SECRET_KEY 미설정 시 인증 건너뜀 (개발 환경)
    next();
    return;
  }

  if (!apiKey || apiKey !== secretKey) {
    res.status(401).json({ error: '인증 실패: 유효한 API 키가 필요합니다.' });
    return;
  }

  next();
}
