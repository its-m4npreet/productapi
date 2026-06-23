import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { productRouter } from './routes/products.js';
import { categoryRouter } from './routes/categories.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

if (config.nodeEnv !== 'test') {
  app.use(morgan('short'));
}

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

app.use('/api/health', healthRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/products', productRouter);

app.use(errorHandler);

export default app;
