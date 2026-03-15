import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { apiKeyAuth } from './middleware/auth';
import employeesRouter from './routes/employees';
import ratesRouter from './routes/rates';
import payrollRouter from './routes/payroll';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// 미들웨어
app.use(cors());
app.use(express.json());

// 헬스체크 (인증 불필요)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'payroll-bot', timestamp: new Date().toISOString() });
});

// API 인증 미들웨어 적용
app.use('/api', apiKeyAuth);

// 라우트
app.use('/api/employees', employeesRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/payroll', payrollRouter);

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 급여 봇 서버 시작: http://localhost:${PORT}`);
  console.log(`   헬스체크: http://localhost:${PORT}/health`);
});

export default app;
